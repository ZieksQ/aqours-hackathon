using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aqours.Application.Features.Accounts;
using Aqours.Application.Features.Weather;
using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Features.Weather;
using Aqours.Domain.Locations;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class WeatherIntegrationTests(ApiFixture fixture)
{
    private static readonly PsgcAddress Address = new("0100000000", "Region I", "0102800000", "Ilocos Norte",
        "0102801000", "Adams", null, null, "0102801001", "Adams", "Weather integration landmark");

    [Theory]
    [InlineData(AccountRoles.Admin)]
    [InlineData(AccountRoles.Staff)]
    public async Task Weather_reads_require_completed_personnel_onboarding(string role)
    {
        var provider = new TestForecastProvider();
        using var factory = Factory(provider, new TestClock());
        using var client = await WebClientAsync(factory, role, false);
        foreach (var path in Paths())
        {
            using var denied = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        }
        using var deniedWrite = await client.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 35 });
        Assert.Equal(HttpStatusCode.Forbidden, deniedWrite.StatusCode);
        await CompletePasswordAsync(client);
        await ReadAsync(client, "/api/staff/weather/settings");
        // Empty far page reads settings and verifies the pagination contract without fetching every existing site.
        var page = await ReadAsync(client, "/api/staff/weather/sites?page=2147483647&pageSize=100");
        Assert.Empty(page.GetProperty("items").EnumerateArray());
        using var unknown = await client.GetAsync($"/api/staff/supply-sites/{Guid.NewGuid()}/weather");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(0, provider.Calls);
    }

    [Fact]
    public async Task Anonymous_and_customer_cannot_access_any_weather_endpoint()
    {
        using var anonymous = fixture.Factory.CreateClient();
        var email = $"weather-customer-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(AccountRoles.Customer, email);
        using var customer = fixture.Factory.CreateClient();
        using var login = await customer.PostAsJsonAsync("/api/auth/mobile/login", new { email, password = ApiFixture.AdminPassword });
        login.EnsureSuccessStatusCode();
        var session = await login.Content.ReadFromJsonAsync<JsonElement>();
        customer.DefaultRequestHeaders.Authorization = new("Bearer", session.GetProperty("accessToken").GetString());
        using var changed = await customer.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = ApiFixture.AdminPassword,
            newPassword = ApiFixture.ChangedPassword
        });
        changed.EnsureSuccessStatusCode();
        session = await changed.Content.ReadFromJsonAsync<JsonElement>();
        customer.DefaultRequestHeaders.Authorization = new("Bearer", session.GetProperty("accessToken").GetString());
        foreach (var client in new[] { anonymous, customer })
        {
            foreach (var path in Paths())
            {
                using var denied = await client.GetAsync(path);
                Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
            }
            using var write = await client.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 35 });
            Assert.Equal(HttpStatusCode.Unauthorized, write.StatusCode);
        }
    }

    [Fact]
    public async Task Settings_validate_fields_require_Admin_and_CSRF_and_persist_across_scopes()
    {
        var clock = new TestClock();
        using var factory = Factory(new TestForecastProvider(), clock);
        using var staff = await WebClientAsync(factory, AccountRoles.Staff);
        using var admin = await WebClientAsync(factory, AccountRoles.Admin);
        using var staffWrite = await staff.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 36 });
        Assert.Equal(HttpStatusCode.Forbidden, staffWrite.StatusCode);
        admin.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        using var missingCsrf = await admin.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 36 });
        Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);
        await SetCsrfAsync(admin);
        foreach (var json in new[] { "{}", "{\"heatThresholdCelsius\":null}", "{\"heatThresholdCelsius\":\"35\"}",
            "{\"heatThresholdCelsius\":true}", "{\"heatThresholdCelsius\":-0.01}", "{\"heatThresholdCelsius\":60.01}" })
        {
            using var invalid = await admin.PutAsync("/api/admin/weather/settings", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
            var error = await invalid.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(error.GetProperty("errors").TryGetProperty("heatThresholdCelsius", out _));
        }
        foreach (var threshold in new[] { 0d, 60d, 35.5 })
        {
            using var changed = await admin.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = threshold });
            changed.EnsureSuccessStatusCode();
            var result = await ReadAsync(staff, "/api/staff/weather/settings");
            Assert.Equal(threshold, result.GetProperty("heatThresholdCelsius").GetDouble());
            Assert.Equal(clock.Now, result.GetProperty("updatedAt").GetDateTimeOffset());
            using var scope = factory.Services.CreateScope();
            var persisted = await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().WeatherSettings.AsNoTracking().SingleAsync();
            Assert.Equal(threshold, persisted.HeatThresholdCelsius);
        }
        using var reset = await admin.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 35 });
        reset.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Cached_forecasts_are_persisted_and_reassessed_after_threshold_and_supply_changes()
    {
        var provider = new TestForecastProvider();
        var clock = new TestClock();
        using var factory = Factory(provider, clock);
        using var admin = await WebClientAsync(factory, AccountRoles.Admin);
        using var staff = await WebClientAsync(factory, AccountRoles.Staff);
        using var setting = await admin.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 35 });
        setting.EnsureSuccessStatusCode();
        var site = await AddSiteAsync("Weather immediate", clock.Now);
        var path = $"/api/staff/supply-sites/{site.Id}/weather";
        var absentSupply = await ReadAsync(staff, path);
        Assert.True(absentSupply.GetProperty("supplyMissing").GetBoolean());
        Assert.All(absentSupply.GetProperty("days").EnumerateArray(), day => Assert.Equal("Unknown", day.GetProperty("warningState").GetString()));
        using var recorded = await staff.PostAsJsonAsync($"/api/staff/supply-sites/{site.Id}/supply-updates", new { status = "Low" });
        recorded.EnsureSuccessStatusCode();
        var low = await ReadAsync(staff, path);
        Assert.Equal("PotentialSupplyRisk", low.GetProperty("days")[0].GetProperty("warningState").GetString());
        Assert.Equal("NoWarning", low.GetProperty("days")[1].GetProperty("warningState").GetString());
        Assert.Contains("ReviewStockAndReplenishment", Actions(low));
        using var changed = await admin.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 40 });
        changed.EnsureSuccessStatusCode();
        var higher = await ReadAsync(staff, path);
        Assert.All(higher.GetProperty("days").EnumerateArray(), day => Assert.Equal("NoWarning", day.GetProperty("warningState").GetString()));
        using var unavailable = await staff.PostAsJsonAsync($"/api/staff/supply-sites/{site.Id}/supply-updates", new { status = "Unavailable" });
        unavailable.EnsureSuccessStatusCode();
        var interrupted = await ReadAsync(staff, path);
        Assert.Equal("Unavailable", interrupted.GetProperty("latestSupplyStatus").GetString());
        Assert.Contains("VerifyInterruptionAndArrangeSupply", Actions(interrupted));
        Assert.Contains("CommunicateConfirmedServiceChanges", Actions(interrupted));
        Assert.Equal(1, provider.Calls);
        using var scope = factory.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().WeatherForecasts.AsNoTracking().SingleAsync(row => row.SiteId == site.Id);
        Assert.Equal(clock.Now, stored.RetrievedAt);
        Assert.Equal(site.Latitude, stored.Latitude);
        using var reset = await admin.PutAsJsonAsync("/api/admin/weather/settings", new { heatThresholdCelsius = 35 });
        reset.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Failed_refresh_retains_stale_forecast_and_changed_coordinates_discard_it()
    {
        var provider = new TestForecastProvider();
        var clock = new TestClock();
        using var factory = Factory(provider, clock);
        using var staff = await WebClientAsync(factory, AccountRoles.Staff);
        var site = await AddSiteAsync("Weather stale", clock.Now);
        var path = $"/api/staff/supply-sites/{site.Id}/weather";
        var fresh = await ReadAsync(staff, path);
        provider.Failing = true;
        clock.Now = clock.Now.AddHours(1);
        var stale = await ReadAsync(staff, path);
        Assert.True(stale.GetProperty("forecastStale").GetBoolean());
        Assert.True(stale.GetProperty("isProvisional").GetBoolean());
        Assert.Equal(fresh.GetProperty("forecastRetrievedAt").GetDateTimeOffset(), stale.GetProperty("forecastRetrievedAt").GetDateTimeOffset());
        Assert.Equal(38d, stale.GetProperty("days")[0].GetProperty("maximumTemperatureCelsius").GetDouble());
        await ReadAsync(staff, path);
        Assert.Equal(2, provider.Calls);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
            var tracked = await db.SupplySites.SingleAsync(row => row.Id == site.Id);
            tracked.Replace(tracked.Name, tracked.Address, 15, 122, clock.Now);
            await db.SaveChangesAsync();
        }
        var moved = await ReadAsync(staff, path);
        Assert.True(moved.GetProperty("forecastMissing").GetBoolean());
        Assert.Equal(JsonValueKind.Null, moved.GetProperty("forecastRetrievedAt").ValueKind);
        Assert.All(moved.GetProperty("days").EnumerateArray(), day => Assert.Equal("Unknown", day.GetProperty("warningState").GetString()));
        Assert.Equal(3, provider.Calls);
        using var check = factory.Services.CreateScope();
        var cache = await check.ServiceProvider.GetRequiredService<AqoursDbContext>().WeatherForecasts.AsNoTracking().SingleAsync(row => row.SiteId == site.Id);
        Assert.Equal(15d, cache.Latitude);
        Assert.Null(cache.RetrievedAt);
        Assert.NotNull(cache.RetryAfter);
    }

    [Theory]
    [InlineData("page=0", "page")]
    [InlineData("page=bad", "page")]
    [InlineData("page=2147483648", "page")]
    [InlineData("pageSize=0", "pageSize")]
    [InlineData("pageSize=101", "pageSize")]
    [InlineData("pageSize=1.5", "pageSize")]
    public async Task Listing_rejects_invalid_pagination(string query, string field)
    {
        using var staff = await WebClientAsync(fixture.Factory, AccountRoles.Staff);
        using var invalid = await staff.GetAsync($"/api/staff/weather/sites?{query}");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var body = await invalid.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task Listing_is_stable_paginated_and_keeps_sites_without_readings_or_forecasts()
    {
        var provider = new TestForecastProvider { Failing = true };
        var clock = new TestClock();
        using var factory = Factory(provider, clock);
        using var staff = await WebClientAsync(factory, AccountRoles.Staff);
        var first = await AddSiteAsync("Weather duplicate name", clock.Now);
        var second = await AddSiteAsync("Weather duplicate name", clock.Now);
        var expected = new List<Guid>();
        using (var scope = factory.Services.CreateScope())
            expected = await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplySites.AsNoTracking()
                .OrderBy(row => row.Name).ThenBy(row => row.Id).Select(row => row.Id).ToListAsync();
        var actual = new List<Guid>();
        for (var page = 1; ; page++)
        {
            var body = await ReadAsync(staff, $"/api/staff/weather/sites?page={page}&pageSize=7");
            Assert.Equal(expected.Count, body.GetProperty("totalCount").GetInt32());
            foreach (var item in body.GetProperty("items").EnumerateArray())
            {
                actual.Add(item.GetProperty("id").GetGuid());
                if (item.GetProperty("id").GetGuid() == first.Id || item.GetProperty("id").GetGuid() == second.Id)
                {
                    Assert.True(item.GetProperty("supplyMissing").GetBoolean());
                    Assert.True(item.GetProperty("forecastMissing").GetBoolean());
                    Assert.Contains("VerifyConditionsWithoutFreshForecast", Actions(item));
                }
            }
            if (actual.Count >= expected.Count) break;
        }
        Assert.Equal(expected, actual);
    }

    private WebApplicationFactory<Program> Factory(TestForecastProvider provider, TestClock clock) => fixture.Factory.WithWebHostBuilder(builder =>
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IWeatherForecastProvider>();
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<IWeatherForecastProvider>(provider);
            services.AddSingleton<TimeProvider>(clock);
        }));

    private async Task<SupplySite> AddSiteAsync(string name, DateTimeOffset now)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var site = new SupplySite(name, Address, 14.5, 121.2, now);
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        db.SupplySites.Add(site);
        await db.SaveChangesAsync();
        return site;
    }

    private async Task CreateAccountAsync(string role, string email)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>().CreateAsync(new(
            email, "Weather", null, "Operator", ApiFixture.AdminPassword, role));
        Assert.True(result.Succeeded);
    }

    private async Task<HttpClient> WebClientAsync(WebApplicationFactory<Program> factory, string role, bool onboarded = true)
    {
        var email = $"weather-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(role, email);
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await SetCsrfAsync(client);
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword });
        login.EnsureSuccessStatusCode();
        if (onboarded) await CompletePasswordAsync(client);
        return client;
    }

    private static async Task CompletePasswordAsync(HttpClient client)
    {
        await SetCsrfAsync(client);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = ApiFixture.AdminPassword,
            newPassword = ApiFixture.ChangedPassword
        });
        changed.EnsureSuccessStatusCode();
        await SetCsrfAsync(client);
    }

    private static async Task SetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/web/csrf");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", body.GetProperty("requestToken").GetString());
    }

    private static async Task<JsonElement> ReadAsync(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static IEnumerable<string> Paths() => ["/api/staff/weather/settings", "/api/staff/weather/sites", $"/api/staff/supply-sites/{Guid.NewGuid()}/weather"];
    private static IEnumerable<string?> Actions(JsonElement response) => response.GetProperty("recommendedActions").EnumerateArray().Select(action => action.GetProperty("code").GetString());

    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 10, 29, 2, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class TestForecastProvider : IWeatherForecastProvider
    {
        private int _calls;
        public int Calls => _calls;
        public bool Failing { get; set; }
        public Task<IReadOnlyList<ForecastTemperature>?> FetchAsync(double latitude, double longitude, DateOnly today, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            IReadOnlyList<ForecastTemperature>? days = Failing ? null :
                [new(today, 38), new(today.AddDays(1), 35), new(today.AddDays(2), 34)];
            return Task.FromResult(days);
        }
    }
}
