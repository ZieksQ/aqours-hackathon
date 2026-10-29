using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Features.Reports;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Locations;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class SupplierMapIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly PsgcAddress Address = new("0100000000", "Region I", "0102800000", "Ilocos Norte",
        "0102801000", "Adams", null, null, "0102801001", "Adams", "Map integration landmark");

    [Theory]
    [InlineData(AccountRoles.Admin)]
    [InlineData(AccountRoles.Staff)]
    public async Task Personnel_can_read_both_layers_only_after_password_setup(string role)
    {
        using var client = await WebClientAsync(role, changePassword: false);
        foreach (var layer in new[] { "sites", "reports" })
        {
            using var denied = await client.GetAsync($"/api/staff/map/{layer}");
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        }
        await CompletePasswordAsync(client);
        foreach (var layer in new[] { "sites", "reports" })
        {
            var body = await ReadAsync(client, layer);
            Assert.Equal(1, body.GetProperty("page").GetInt32());
            Assert.Equal(20, body.GetProperty("pageSize").GetInt32());
            Assert.Equal(new[] { "items", "page", "pageSize", "totalCount" }, body.EnumerateObject().Select(field => field.Name).Order());
        }
    }

    [Fact]
    public async Task Anonymous_and_completed_customer_sessions_cannot_read_either_layer()
    {
        using var anonymous = fixture.Factory.CreateClient();
        var email = $"map-customer-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(AccountRoles.Customer, email);
        using var customer = fixture.Factory.CreateClient();
        using var login = await customer.PostAsJsonAsync("/api/auth/mobile/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        login.EnsureSuccessStatusCode();
        var session = await login.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        customer.DefaultRequestHeaders.Authorization = new("Bearer", session.GetProperty("accessToken").GetString());
        using var changed = await customer.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = ApiFixture.AdminPassword,
            newPassword = ApiFixture.ChangedPassword
        }, JsonOptions);
        changed.EnsureSuccessStatusCode();
        var completed = await changed.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        customer.DefaultRequestHeaders.Authorization = new("Bearer", completed.GetProperty("accessToken").GetString());
        foreach (var client in new[] { anonymous, customer })
            foreach (var layer in new[] { "sites", "reports" })
            {
                using var denied = await client.GetAsync($"/api/staff/map/{layer}");
                Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
            }
    }

    [Fact]
    public async Task Report_filters_handler_mapping_and_projection_preserve_privacy()
    {
        using var admin = await WebClientAsync(AccountRoles.Admin);
        var customerId = await CreateAccountAsync(AccountRoles.Customer);
        var handlerId = await CreateAccountAsync(AccountRoles.Staff);
        var otherHandlerId = await CreateAccountAsync(AccountRoles.Staff);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var now = DateTimeOffset.UtcNow;
        var reports = new[]
        {
            new Report(customerId, IssueType.NoWater, "Private customer description", Address, 14.5, 121.2, now),
            new Report(customerId, IssueType.LowPressure, "Private customer description", Address, 14.5, 121.2, now),
            new Report(customerId, IssueType.DirtyWater, "Private customer description", Address, 14.7, 121.3, now)
        };
        db.Reports.AddRange(reports);
        await db.SaveChangesAsync();
        await db.Reports.Where(report => report.Id == reports[1].Id).ExecuteUpdateAsync(update => update
            .SetProperty(report => report.Status, ReportStatus.InProgress).SetProperty(report => report.AssignedStaffId, handlerId)
            .SetProperty(report => report.Priority, ReportPriority.High));
        await db.Reports.Where(report => report.Id == reports[2].Id).ExecuteUpdateAsync(update => update
            .SetProperty(report => report.Status, ReportStatus.Resolved).SetProperty(report => report.AssignedStaffId, otherHandlerId)
            .SetProperty(report => report.Priority, ReportPriority.Low));
        db.ReportMessages.Add(new(reports[1].Id, customerId, "Private conversation body", now));
        await db.SaveChangesAsync();

        foreach (var status in new[] { "", "unresolved", "all", "Submitted", "InProgress", "Resolved" })
        {
            var entries = await ReadAllAsync(admin, "reports", status.Length > 0 ? $"&status={status}" : "");
            var expected = status switch
            {
                "Submitted" => reports.Take(1),
                "InProgress" => reports.Skip(1).Take(1),
                "Resolved" => reports.Skip(2),
                "all" => reports.AsEnumerable(),
                _ => reports.Take(2)
            };
            Assert.Equal(expected.Select(report => report.Id).Order(), entries.Where(item => reports.Any(report => report.Id == item.GetProperty("id").GetGuid()))
                .Select(item => item.GetProperty("id").GetGuid()).Order());
            Assert.All(entries, item =>
            {
                var actualStatus = item.GetProperty("status").GetString();
                if (status is "" or "unresolved") Assert.NotEqual("Resolved", actualStatus);
                else if (status != "all") Assert.Equal(status, actualStatus);
            });
        }
        var all = await ReadAllAsync(admin, "reports", "&status=all");
        var submitted = Assert.Single(all, item => item.GetProperty("id").GetGuid() == reports[0].Id);
        var assigned = Assert.Single(all, item => item.GetProperty("id").GetGuid() == reports[1].Id);
        Assert.Equal(JsonValueKind.Null, submitted.GetProperty("handlerId").ValueKind);
        Assert.Equal(JsonValueKind.Null, submitted.GetProperty("handlerName").ValueKind);
        Assert.Equal(handlerId, assigned.GetProperty("handlerId").GetString());
        Assert.Equal("Map Operator", assigned.GetProperty("handlerName").GetString());
        Assert.Equal("High", assigned.GetProperty("priority").GetString());
        Assert.Equal("LowPressure", assigned.GetProperty("issueType").GetString());
        Assert.Equal(14.5, assigned.GetProperty("latitude").GetDouble());
        Assert.Equal(121.2, assigned.GetProperty("longitude").GetDouble());
        Assert.Equal(reports[1].CreatedAt, assigned.GetProperty("createdAt").GetDateTimeOffset());
        Assert.Equal(Address.Details, assigned.GetProperty("address").GetProperty("details").GetString());
        var fields = new[] { "address", "createdAt", "handlerId", "handlerName", "id", "issueType", "latitude", "longitude", "priority", "status" };
        Assert.All(all, item => Assert.Equal(fields, item.EnumerateObject().Select(field => field.Name).Order()));
        var payload = JsonSerializer.Serialize(all);
        Assert.DoesNotContain("@aqours.test", payload);
        Assert.DoesNotContain(customerId, payload);
        Assert.DoesNotContain("Private customer description", payload);
        Assert.DoesNotContain("Private conversation body", payload);
    }

    [Fact]
    public async Task Pagination_matches_stable_site_and_report_order_with_tied_names_and_creation_times()
    {
        using var staff = await WebClientAsync(AccountRoles.Staff);
        var customerId = await CreateAccountAsync(AccountRoles.Customer);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var now = DateTimeOffset.UtcNow;
        db.SupplySites.AddRange(Enumerable.Range(0, 3).Select(_ => new SupplySite("Map duplicate site name", Address, 14.5, 121.2, now)));
        db.Reports.AddRange(Enumerable.Range(0, 3).Select(_ => new Report(customerId, IssueType.NoWater, "Private", Address, 14.5, 121.2, now)));
        await db.SaveChangesAsync();
        var siteIds = await db.SupplySites.OrderBy(site => site.Name).ThenBy(site => site.Id).Select(site => site.Id).ToListAsync();
        var reportIds = await db.Reports.OrderByDescending(report => report.CreatedAt).ThenByDescending(report => report.Id).Select(report => report.Id).ToListAsync();
        foreach (var (layer, expected) in new[] { ("sites", siteIds), ("reports", reportIds) })
        {
            var actual = new List<Guid>();
            for (var page = 1; actual.Count < expected.Count; page++)
            {
                var response = await ReadAsync(staff, layer, $"?status=all&pageSize=2&page={page}");
                Assert.Equal(page, response.GetProperty("page").GetInt32());
                Assert.Equal(2, response.GetProperty("pageSize").GetInt32());
                Assert.Equal(expected.Count, response.GetProperty("totalCount").GetInt32());
                actual.AddRange(response.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()));
            }
            Assert.Equal(expected, actual);
            Assert.Equal(actual.Count, actual.Distinct().Count());
            var beyond = await ReadAsync(staff, layer, "?status=all&pageSize=100&page=2147483647");
            Assert.Empty(beyond.GetProperty("items").EnumerateArray());
            Assert.Equal(expected.Count, beyond.GetProperty("totalCount").GetInt32());
            Assert.Equal(int.MaxValue, beyond.GetProperty("page").GetInt32());
        }
    }

    [Fact]
    public async Task Sites_expose_no_reading_or_the_latest_sequence_even_when_reading_timestamps_tie()
    {
        using var staff = await WebClientAsync(AccountRoles.Staff);
        var updaterId = await CreateAccountAsync(AccountRoles.Staff);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var now = DateTimeOffset.UtcNow;
        var sites = new[]
        {
            new SupplySite("Map without reading", Address, 14.5, 121.2, now),
            new SupplySite("Map latest reading", Address, 14.5, 121.2, now)
        };
        db.SupplySites.AddRange(sites);
        await db.SaveChangesAsync();
        SupplyUpdate? latest = null;
        foreach (var status in new[] { SupplyStatus.Normal, SupplyStatus.Low, SupplyStatus.Unavailable })
        {
            latest = new(sites[1].Id, status, updaterId, "Private updater snapshot", now);
            db.SupplyUpdates.Add(latest);
            await db.SaveChangesAsync();
        }
        var items = await ReadAllAsync(staff, "sites");
        var absent = Assert.Single(items, item => item.GetProperty("id").GetGuid() == sites[0].Id);
        var present = Assert.Single(items, item => item.GetProperty("id").GetGuid() == sites[1].Id);
        Assert.Equal(JsonValueKind.Null, absent.GetProperty("latestSupplyStatus").ValueKind);
        Assert.Equal(JsonValueKind.Null, absent.GetProperty("latestSupplyAt").ValueKind);
        Assert.Equal("Unavailable", present.GetProperty("latestSupplyStatus").GetString());
        Assert.Equal(latest!.UpdatedAt, present.GetProperty("latestSupplyAt").GetDateTimeOffset());
        Assert.Equal(sites[1].Name, present.GetProperty("name").GetString());
        var fields = new[] { "address", "id", "latestSupplyAt", "latestSupplyStatus", "latitude", "longitude", "name" };
        Assert.All(items, item => Assert.Equal(fields, item.EnumerateObject().Select(field => field.Name).Order()));
        Assert.DoesNotContain(updaterId, JsonSerializer.Serialize(items));
        Assert.DoesNotContain("Private updater snapshot", JsonSerializer.Serialize(items));
    }

    [Theory]
    [InlineData("page=0", "page")]
    [InlineData("page=-1", "page")]
    [InlineData("page=word", "page")]
    [InlineData("page=2147483648", "page")]
    [InlineData("pageSize=0", "pageSize")]
    [InlineData("pageSize=101", "pageSize")]
    [InlineData("pageSize=1.5", "pageSize")]
    public async Task Both_layers_reject_invalid_pagination(string query, string field)
    {
        using var staff = await WebClientAsync(AccountRoles.Staff);
        foreach (var layer in new[] { "sites", "reports" })
        {
            using var response = await staff.GetAsync($"/api/staff/map/{layer}?{query}");
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            Assert.True(body.GetProperty("errors").TryGetProperty(field, out _));
        }
    }

    [Theory]
    [InlineData("submitted")]
    [InlineData("0")]
    [InlineData("unknown")]
    [InlineData("")]
    public async Task Reports_reject_invalid_status_values(string status)
    {
        using var admin = await WebClientAsync(AccountRoles.Admin);
        using var response = await admin.GetAsync($"/api/staff/map/reports?status={status}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.True(body.GetProperty("errors").TryGetProperty("status", out _));
    }

    private async Task<string> CreateAccountAsync(string role, string? email = null)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>().CreateAsync(new(
            email ?? $"map-{Guid.NewGuid():N}@aqours.test", "Map", null, "Operator", ApiFixture.AdminPassword, role));
        Assert.True(result.Succeeded);
        return result.Value!.Account.Id;
    }

    private async Task<HttpClient> WebClientAsync(string role, bool changePassword = true)
    {
        var email = $"map-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(role, email);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await SetCsrfAsync(client);
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        login.EnsureSuccessStatusCode();
        if (changePassword) await CompletePasswordAsync(client);
        return client;
    }

    private static async Task CompletePasswordAsync(HttpClient client)
    {
        await SetCsrfAsync(client);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = ApiFixture.AdminPassword,
            newPassword = ApiFixture.ChangedPassword
        }, JsonOptions);
        changed.EnsureSuccessStatusCode();
    }

    private static async Task SetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/web/csrf");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", body.GetProperty("requestToken").GetString());
    }

    private static async Task<JsonElement> ReadAsync(HttpClient client, string layer, string query = "")
    {
        using var response = await client.GetAsync($"/api/staff/map/{layer}{query}");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
    }

    private static async Task<List<JsonElement>> ReadAllAsync(HttpClient client, string layer, string query = "")
    {
        var items = new List<JsonElement>();
        for (var page = 1; ; page++)
        {
            var body = await ReadAsync(client, layer, $"?pageSize=100&page={page}{query}");
            items.AddRange(body.GetProperty("items").EnumerateArray());
            if (items.Count >= body.GetProperty("totalCount").GetInt32()) return items;
        }
    }
}
