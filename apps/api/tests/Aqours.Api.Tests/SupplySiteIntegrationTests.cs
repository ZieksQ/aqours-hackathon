using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Locations;
using Aqours.Infrastructure.Features.SupplySites;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class SupplySiteIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Admin_can_create_list_read_and_update_persisted_sites()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        var suffix = Guid.NewGuid().ToString("N");
        var request = MakeSiteRequest("Integration Site " + suffix);
        var requestedAt = DateTimeOffset.UtcNow;

        using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", request, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.NotNull(created.Headers.Location);
        using var createdBody = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var createdSite = createdBody!.RootElement;
        var id = createdSite.GetProperty("id").GetGuid();
        var createdAt = createdSite.GetProperty("createdAt").GetDateTimeOffset();
        Assert.Equal(request.Name, createdSite.GetProperty("name").GetString());
        Assert.Equal(14.5, createdSite.GetProperty("latitude").GetDouble());
        Assert.Equal(121.2, createdSite.GetProperty("longitude").GetDouble());
        Assert.InRange(createdAt, requestedAt.AddSeconds(-1), DateTimeOffset.UtcNow.AddSeconds(5));
        Assert.Equal(createdAt, createdSite.GetProperty("updatedAt").GetDateTimeOffset());
        AssertAddress(createdSite.GetProperty("address"), request.Address,
            "Region I (Ilocos Region)", "Ilocos Norte", "Adams", null, "Adams");

        using var get = await admin.Client.GetAsync(created.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        using var readBody = await get.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(id, readBody!.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(createdAt, readBody.RootElement.GetProperty("createdAt").GetDateTimeOffset());

        using var list = await admin.Client.GetAsync("/api/admin/supply-sites");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var listBody = await list.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var listing = listBody!.RootElement;
        Assert.Equal(1, listing.GetProperty("page").GetInt32());
        Assert.Equal(20, listing.GetProperty("pageSize").GetInt32());
        using var listScope = fixture.Factory.Services.CreateScope();
        var allIds = await listScope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplySites
            .OrderBy(site => site.Name).ThenBy(site => site.Id).Select(site => site.Id).ToListAsync();
        var orderedIndex = allIds.IndexOf(id);
        Assert.True(orderedIndex >= 0);
        using var targetPage = await admin.Client.GetAsync($"/api/admin/supply-sites?page={orderedIndex / 20 + 1}&pageSize=20");
        using var targetBody = await targetPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Contains(targetBody!.RootElement.GetProperty("items").EnumerateArray(), item => item.GetProperty("id").GetGuid() == id);

        var changed = request with
        {
            Name = "Updated Integration Site " + suffix,
            Address = request.Address with { Details = " Updated gate entrance " },
            Latitude = -90,
            Longitude = -180
        };
        var updateStarted = DateTimeOffset.UtcNow;
        using var updated = await admin.Client.PutAsJsonAsync($"/api/admin/supply-sites/{id}", changed, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        using var updatedBody = await updated.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var updatedSite = updatedBody!.RootElement;
        Assert.Equal(changed.Name, updatedSite.GetProperty("name").GetString());
        Assert.Equal(-90, updatedSite.GetProperty("latitude").GetDouble());
        Assert.Equal(-180, updatedSite.GetProperty("longitude").GetDouble());
        Assert.Equal(createdAt, updatedSite.GetProperty("createdAt").GetDateTimeOffset());
        Assert.InRange(updatedSite.GetProperty("updatedAt").GetDateTimeOffset(), updateStarted.AddSeconds(-1), DateTimeOffset.UtcNow.AddSeconds(5));
        AssertAddress(updatedSite.GetProperty("address"), changed.Address,
            "Region I (Ilocos Region)", "Ilocos Norte", "Adams", null, "Adams");

        using var scope = fixture.Factory.Services.CreateScope();
        var persisted = await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplySites.SingleAsync(x => x.Id == id);
        Assert.Equal(changed.Name, persisted.Name);
        Assert.Equal("Updated gate entrance", persisted.Address.Details);
        Assert.Equal(-90, persisted.Latitude);
        Assert.Equal(-180, persisted.Longitude);
        Assert.Equal(createdAt, persisted.CreatedAt);
    }

    [Fact]
    public async Task Address_resolution_supports_province_less_ncr_and_manila_submunicipality()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);

        using var caloocan = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("NCR " + Guid.NewGuid().ToString("N"),
            new("1300000000", null, "1380100000", null, "1380100001", " Barangay 1 ")), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, caloocan.StatusCode);
        using var caloocanBody = await caloocan.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        AssertAddress(caloocanBody!.RootElement.GetProperty("address"),
            new("1300000000", null, "1380100000", null, "1380100001", "Barangay 1"),
            "National Capital Region (NCR)", null, "City of Caloocan", null, "Barangay 1");

        using var manila = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("Manila " + Guid.NewGuid().ToString("N"),
            new("1300000000", null, "1380600000", "1380601000", "1380601001", "Tondo")), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, manila.StatusCode);
        using var manilaBody = await manila.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        AssertAddress(manilaBody!.RootElement.GetProperty("address"),
            new("1300000000", null, "1380600000", "1380601000", "1380601001", "Tondo"),
            "National Capital Region (NCR)", null, "City of Manila", "Tondo I/II", "Barangay 1");
    }

    [Fact]
    public async Task Invalid_site_create_and_update_are_rejected_without_changing_persisted_values()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        var original = MakeSiteRequest("Stable " + Guid.NewGuid().ToString("N"));
        using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", original, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var id = body!.RootElement.GetProperty("id").GetGuid();
        var originalCreatedAt = body.RootElement.GetProperty("createdAt").GetDateTimeOffset();
        var originalUpdatedAt = body.RootElement.GetProperty("updatedAt").GetDateTimeOffset();

        var invalid = new (SupplySiteRequest Request, string Field)[]
        {
            (original with { Name = " " }, "name"),
            (original with { Name = null! }, "name"),
            (original with { Name = new string('n', 201) }, "name"),
            (original with { Address = original.Address with { Details = " " } }, "address.details"),
            (original with { Address = original.Address with { Details = null! } }, "address.details"),
            (original with { Address = original.Address with { Details = new string('d', 501) } }, "address.details"),
            (original with { Latitude = 90.0001 }, "latitude"),
            (original with { Latitude = -90.0001 }, "latitude"),
            (original with { Longitude = 180.0001 }, "longitude"),
            (original with { Longitude = -180.0001 }, "longitude"),
            (original with { Address = original.Address with { RegionCode = "0200000000" } }, "address.regionCode"),
            (original with { Address = original.Address with { ProvinceCode = "0102900000" } }, "address.provinceCode"),
            (original with { Address = original.Address with { CityMunicipalityCode = "0102802000" } }, "address.cityMunicipalityCode"),
            (original with { Address = original.Address with { BarangayCode = "0102801002" } }, "address.barangayCode"),
            (original with { Address = original.Address with { ProvinceCode = null } }, "address.provinceCode"),
            (original with { Address = original.Address with { RegionCode = null } }, "address.regionCode"),
            (original with { Address = original.Address with { CityMunicipalityCode = null } }, "address.cityMunicipalityCode"),
            (original with { Address = original.Address with { BarangayCode = null } }, "address.barangayCode"),
            (original with { Latitude = null }, "latitude"),
            (original with { Longitude = null }, "longitude"),
            (original with { Address = null! }, "address"),
            (original with { Address = new("1300000000", null, "1380600000", null, "1380601001", "Tondo") }, "address.subMunicipalityCode"),
            (original with { Address = new("1300000000", null, "1380600000", "1380602000", "1380601001", "Tondo") }, "address.subMunicipalityCode")
        };

        foreach (var (request, field) in invalid)
        {
            using var response = await admin.Client.PutAsJsonAsync($"/api/admin/supply-sites/{id}", request, JsonOptions);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var validation = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(validation!.RootElement.GetProperty("errors").TryGetProperty(field, out _),
                $"Expected validation error for '{field}'.");
        }

        using var nonFinite = await admin.Client.PutAsync($"/api/admin/supply-sites/{id}", new StringContent("""
            { "name": "invalid", "address": { "regionCode": "0100000000", "provinceCode": "0102800000",
              "cityMunicipalityCode": "0102801000", "barangayCode": "0102801001", "details": "Gate" },
              "latitude": 1e400, "longitude": 0 }
            """, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, nonFinite.StatusCode);
        using var nonFiniteLongitude = await admin.Client.PutAsync($"/api/admin/supply-sites/{id}", new StringContent("""
            { "name": "invalid", "address": { "regionCode": "0100000000", "provinceCode": "0102800000",
              "cityMunicipalityCode": "0102801000", "barangayCode": "0102801001", "details": "Gate" },
              "latitude": 0, "longitude": -1e400 }
            """, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, nonFiniteLongitude.StatusCode);

        using var prePostScope = fixture.Factory.Services.CreateScope();
        var prePostCount = await prePostScope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplySites.CountAsync();
        foreach (var (request, field) in invalid)
        {
            using var response = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", request, JsonOptions);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var validation = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(validation!.RootElement.GetProperty("errors").TryGetProperty(field, out _),
                $"Expected validation error for POST field '{field}'.");
        }

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var persisted = await db.SupplySites.SingleAsync(x => x.Id == id);
        Assert.Equal(original.Name, persisted.Name);
        Assert.Equal(original.Address.Details, persisted.Address.Details);
        Assert.Equal(original.Latitude!.Value, persisted.Latitude);
        Assert.Equal(original.Longitude!.Value, persisted.Longitude);
        Assert.Equal(originalCreatedAt, persisted.CreatedAt);
        Assert.Equal(originalUpdatedAt, persisted.UpdatedAt);
        Assert.Equal(prePostCount, await db.SupplySites.CountAsync());
    }

    [Fact]
    public async Task Maximum_text_and_inclusive_coordinate_boundaries_are_accepted()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        var request = new SupplySiteRequest(new string('n', 200),
            new("0100000000", "0102800000", "0102801000", null, "0102801001", new string('d', 500)), 90, 180);
        using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", request, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var site = body!.RootElement;
        Assert.Equal(200, site.GetProperty("name").GetString()!.Length);
        Assert.Equal(500, site.GetProperty("address").GetProperty("details").GetString()!.Length);
        Assert.Equal(90, site.GetProperty("latitude").GetDouble());
        Assert.Equal(180, site.GetProperty("longitude").GetDouble());

        using var minimum = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest(" x ",
            new("0100000000", "0102800000", "0102801000", null, "0102801001", " d ")) with
        { Latitude = 0, Longitude = 0 }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, minimum.StatusCode);
        using var minimumBody = await minimum.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("x", minimumBody!.RootElement.GetProperty("name").GetString());
        Assert.Equal("d", minimumBody.RootElement.GetProperty("address").GetProperty("details").GetString());
        Assert.Equal(0, minimumBody.RootElement.GetProperty("latitude").GetDouble());
        Assert.Equal(0, minimumBody.RootElement.GetProperty("longitude").GetDouble());
    }

    [Fact]
    public async Task Concurrent_full_replacements_are_last_successful_write_wins()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        var original = MakeSiteRequest("Concurrent baseline " + Guid.NewGuid().ToString("N"));
        using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", original, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var id = body!.RootElement.GetProperty("id").GetGuid();
        var createdAt = body.RootElement.GetProperty("createdAt").GetDateTimeOffset();
        var clock = DateTimeOffset.UtcNow.AddSeconds(1);

        await using var firstScope = fixture.Factory.Services.CreateAsyncScope();
        await using var secondScope = fixture.Factory.Services.CreateAsyncScope();
        var firstStore = firstScope.ServiceProvider.GetRequiredService<ISupplySiteStore>();
        var secondStore = secondScope.ServiceProvider.GetRequiredService<ISupplySiteStore>();
        var firstCopy = await firstStore.FindAsync(id, CancellationToken.None);
        var secondCopy = await secondStore.FindAsync(id, CancellationToken.None);
        Assert.NotNull(firstCopy);
        Assert.NotNull(secondCopy);

        firstCopy!.Replace("First writer", firstCopy.Address with { Details = "First address" }, 10, 20, clock);
        secondCopy!.Replace(secondCopy.Name, secondCopy.Address with { Details = "Second address" },
            secondCopy.Latitude, secondCopy.Longitude, clock.AddSeconds(1));
        await firstStore.UpdateAsync(firstCopy, CancellationToken.None);
        await secondStore.UpdateAsync(secondCopy, CancellationToken.None);

        using var verifyScope = fixture.Factory.Services.CreateScope();
        var final = await verifyScope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplySites.SingleAsync(site => site.Id == id);
        Assert.Equal(original.Name, final.Name);
        Assert.Equal("Second address", final.Address.Details);
        Assert.Equal(original.Latitude, final.Latitude);
        Assert.Equal(original.Longitude, final.Longitude);
        Assert.Equal(createdAt, final.CreatedAt);
    }

    [Fact]
    public async Task List_pagination_is_ordered_bounded_and_missing_sites_return_not_found()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        var suffix = Guid.NewGuid().ToString("N");
        foreach (var name in new[] { "Zulu " + suffix, "Alpha " + suffix, "Mike " + suffix, "Tie " + suffix, "Tie " + suffix })
        {
            using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest(name), JsonOptions);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        }

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var expectedIds = await db.SupplySites.OrderBy(site => site.Name).ThenBy(site => site.Id)
            .Select(site => site.Id).ToListAsync();

        using var firstPage = await admin.Client.GetAsync("/api/admin/supply-sites?page=1&pageSize=100");
        using var firstBody = await firstPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var first = firstBody!.RootElement;
        Assert.Equal(1, first.GetProperty("page").GetInt32());
        Assert.Equal(100, first.GetProperty("pageSize").GetInt32());
        Assert.Equal(expectedIds.Count, first.GetProperty("totalCount").GetInt32());
        var firstIds = first.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToArray();
        Assert.Equal(expectedIds.Take(100), firstIds);

        using var secondPage = await admin.Client.GetAsync("/api/admin/supply-sites?page=2&pageSize=2");
        using var secondBody = await secondPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(expectedIds.Skip(2).Take(2), secondBody!.RootElement.GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid()));
        using var outOfRangePage = await admin.Client.GetAsync("/api/admin/supply-sites?page=2147483647&pageSize=2");
        using var outOfRangeBody = await outOfRangePage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Empty(outOfRangeBody!.RootElement.GetProperty("items").EnumerateArray());

        foreach (var value in new[] { "0", "-1", "", "2147483648", "nope" })
        {
            using var invalidPage = await admin.Client.GetAsync($"/api/admin/supply-sites?page={value}");
            Assert.Equal(HttpStatusCode.BadRequest, invalidPage.StatusCode);
            using var invalidPageBody = await invalidPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(invalidPageBody!.RootElement.GetProperty("errors").TryGetProperty("page", out _));
        }

        foreach (var value in new[] { "0", "-1", "101", "", "2147483648", "nope" })
        {
            using var invalidPageSize = await admin.Client.GetAsync($"/api/admin/supply-sites?pageSize={value}");
            Assert.Equal(HttpStatusCode.BadRequest, invalidPageSize.StatusCode);
            using var invalidPageSizeBody = await invalidPageSize.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(invalidPageSizeBody!.RootElement.GetProperty("errors").TryGetProperty("pageSize", out _));
        }
        using var missing = await admin.Client.GetAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        using var missingUpdate = await admin.Client.PutAsJsonAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001", MakeSiteRequest("Missing"), JsonOptions);
        Assert.Equal(HttpStatusCode.NotFound, missingUpdate.StatusCode);
    }

    [Fact]
    public async Task Admin_cookie_policy_and_csrf_protect_supply_site_actions()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousList = await anonymous.GetAsync("/api/admin/supply-sites");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);
        using var anonymousCreate = await anonymous.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("Unauthorized"), JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousCreate.StatusCode);
        using var anonymousRead = await anonymous.GetAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);
        using var anonymousUpdate = await anonymous.PutAsJsonAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001", MakeSiteRequest("Unauthorized"), JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousUpdate.StatusCode);

        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        using var staffList = await staff.Client.GetAsync("/api/admin/supply-sites");
        Assert.Equal(HttpStatusCode.Forbidden, staffList.StatusCode);
        using var staffCreate = await staff.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("Staff denied"), JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, staffCreate.StatusCode);
        using var staffRead = await staff.Client.GetAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.Forbidden, staffRead.StatusCode);
        using var staffUpdate = await staff.Client.PutAsJsonAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001", MakeSiteRequest("Staff denied"), JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, staffUpdate.StatusCode);

        using var customer = await CreateCustomerClientAsync();
        using var customerList = await customer.GetAsync("/api/admin/supply-sites");
        Assert.Equal(HttpStatusCode.Unauthorized, customerList.StatusCode);
        using var customerRead = await customer.GetAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.Unauthorized, customerRead.StatusCode);
        using var customerCreate = await customer.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("Customer denied"), JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, customerCreate.StatusCode);
        using var customerUpdate = await customer.PutAsJsonAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001", MakeSiteRequest("Customer denied"), JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, customerUpdate.StatusCode);

        using var noCsrf = await CreateWebSessionAsync(AccountRoles.Admin, csrfHeader: false);
        using var missingTokenCreate = await noCsrf.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("No CSRF"), JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, missingTokenCreate.StatusCode);
        using var missingTokenUpdate = await noCsrf.Client.PutAsJsonAsync("/api/admin/supply-sites/00000000-0000-0000-0000-000000000001", MakeSiteRequest("No CSRF"), JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, missingTokenUpdate.StatusCode);

        var saved = await CreateSiteAsync(admin);
        using var badCsrf = await CreateWebSessionAsync(AccountRoles.Admin, csrfHeader: false);
        badCsrf.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "invalid-token");
        using var invalidTokenCreate = await badCsrf.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("Bad CSRF"), JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, invalidTokenCreate.StatusCode);
        using var invalidTokenUpdate = await badCsrf.Client.PutAsJsonAsync($"/api/admin/supply-sites/{saved}", MakeSiteRequest("Bad CSRF"), JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, invalidTokenUpdate.StatusCode);

        using var restricted = await CreateRestrictedWebClientAsync();
        using var restrictedList = await restricted.GetAsync("/api/admin/supply-sites");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedList.StatusCode);
        using var restrictedRead = await restricted.GetAsync($"/api/admin/supply-sites/{saved}");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedRead.StatusCode);
        using var restrictedCreate = await restricted.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("Restricted"), JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, restrictedCreate.StatusCode);
        using var restrictedUpdate = await restricted.PutAsJsonAsync($"/api/admin/supply-sites/{saved}", MakeSiteRequest("Restricted"), JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, restrictedUpdate.StatusCode);
    }

    private static async Task<Guid> CreateSiteAsync(WebClient admin)
    {
        using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", MakeSiteRequest("CSRF target " + Guid.NewGuid().ToString("N")), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return body!.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<WebClient> CreateWebSessionAsync(string role, bool csrfHeader = true)
    {
        var email = $"supply-site-{Guid.NewGuid():N}@aqours.test";
        var accountId = await CreateAccountAsync(email, role);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", await GetCsrfAsync(client));
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = ApiFixture.AdminPassword,
            newPassword = ApiFixture.ChangedPassword
        }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        if (csrfHeader) client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        return new WebClient(client, accountId);
    }

    private async Task<HttpClient> CreateRestrictedWebClientAsync()
    {
        var email = $"restricted-supply-site-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(email, AccountRoles.Admin);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", await GetCsrfAsync(client));
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private async Task<HttpClient> CreateCustomerClientAsync()
    {
        var email = $"supply-site-customer-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(email, AccountRoles.Customer);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var login = await client.PostAsJsonAsync("/api/auth/mobile/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginBody = await login.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", loginBody!.RootElement.GetProperty("accessToken").GetString());
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = ApiFixture.AdminPassword,
            newPassword = ApiFixture.ChangedPassword
        }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var changedBody = await changed.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", changedBody!.RootElement.GetProperty("accessToken").GetString());
        return client;
    }

    private async Task<string> CreateAccountAsync(string email, string role)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>()
            .CreateAsync(new(email, "Integration", "Test", "Site", ApiFixture.AdminPassword, role));
        Assert.True(result.Succeeded, string.Join("; ", result.Errors?.SelectMany(errors => errors.Value) ?? []));
        return result.Value!.Account.Id;
    }

    private static async Task<string> GetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/web/csrf");
        response.EnsureSuccessStatusCode();
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return body!.RootElement.GetProperty("requestToken").GetString()!;
    }

    private static SupplySiteRequest MakeSiteRequest(string name, SiteAddressRequest? address = null) =>
        new(name, address ?? new("0100000000", "0102800000", "0102801000", null, "0102801001", "Near the old bridge"), 14.5, 121.2);

    private static void AssertAddress(JsonElement actual, SiteAddressRequest expected, string regionName,
        string? provinceName, string cityName, string? subMunicipalityName, string barangayName)
    {
        Assert.Equal(expected.RegionCode, actual.GetProperty("regionCode").GetString());
        Assert.Equal(regionName, actual.GetProperty("regionName").GetString());
        Assert.Equal(expected.ProvinceCode, actual.GetProperty("provinceCode").GetString());
        Assert.Equal(provinceName, actual.GetProperty("provinceName").GetString());
        Assert.Equal(expected.CityMunicipalityCode, actual.GetProperty("cityMunicipalityCode").GetString());
        Assert.Equal(cityName, actual.GetProperty("cityMunicipalityName").GetString());
        Assert.Equal(expected.SubMunicipalityCode, actual.GetProperty("subMunicipalityCode").GetString());
        Assert.Equal(subMunicipalityName, actual.GetProperty("subMunicipalityName").GetString());
        Assert.Equal(expected.BarangayCode, actual.GetProperty("barangayCode").GetString());
        Assert.Equal(barangayName, actual.GetProperty("barangayName").GetString());
        Assert.Equal(expected.Details?.Trim(), actual.GetProperty("details").GetString());
    }

    private sealed record SupplySiteRequest(string? Name, SiteAddressRequest Address, double? Latitude, double? Longitude);
    private sealed record SiteAddressRequest(string? RegionCode, string? ProvinceCode, string? CityMunicipalityCode,
        string? SubMunicipalityCode, string? BarangayCode, string? Details);

    private sealed class WebClient(HttpClient client, string accountId) : IDisposable
    {
        public HttpClient Client { get; } = client;
        public string AccountId { get; } = accountId;
        public void Dispose() => Client.Dispose();
    }
}
