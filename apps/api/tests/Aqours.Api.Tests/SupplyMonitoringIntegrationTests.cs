using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Aqours.Infrastructure.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class SupplyMonitoringIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Staff_can_record_repeated_statuses_and_reads_keep_the_updater_snapshot()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var siteId = await CreateSiteAsync(admin);
        var requestedAt = DateTimeOffset.UtcNow;

        using var first = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new
        {
            status = "Low",
            updatedBy = new { id = "spoofed", name = "Spoofed User" },
            updatedById = "spoofed",
            updatedByName = "Spoofed User",
            updatedAt = "2000-01-01T00:00:00Z"
        }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        using var firstBody = await first.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var firstReading = firstBody!.RootElement;
        Assert.Equal(siteId, firstReading.GetProperty("siteId").GetGuid());
        Assert.Equal("Low", firstReading.GetProperty("status").GetString());
        Assert.Equal(staff.AccountId, firstReading.GetProperty("updatedBy").GetProperty("id").GetString());
        Assert.Equal("Integration Monitoring", firstReading.GetProperty("updatedBy").GetProperty("name").GetString());
        var firstAt = firstReading.GetProperty("updatedAt").GetDateTimeOffset();
        Assert.Equal(TimeSpan.Zero, firstAt.Offset);
        Assert.InRange(firstAt, requestedAt.AddSeconds(-2), DateTimeOffset.UtcNow.AddSeconds(5));
        Assert.Equal(0, firstAt.Ticks % 10); // PostgreSQL timestamps have microsecond precision.
        Assert.DoesNotContain("spoofed", firstReading.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("2000-01-01", firstReading.GetRawText(), StringComparison.Ordinal);
        var firstReadingId = firstReading.GetProperty("id").GetGuid();
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var persistedAt = await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplyUpdates
                .Where(update => update.Id == firstReadingId)
                .Select(update => update.UpdatedAt).SingleAsync();
            Assert.Equal(persistedAt, firstAt);
        }

        using var repeat = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, repeat.StatusCode);
        using var repeatBody = await repeat.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.NotEqual(firstReading.GetProperty("id").GetGuid(), repeatBody!.RootElement.GetProperty("id").GetGuid());

        using var unavailable = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Unavailable" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, unavailable.StatusCode);

        using var history = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var items = historyBody!.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, historyBody.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(new[] { "Unavailable", "Low", "Low" }, items.Select(x => x.GetProperty("status").GetString()));
        Assert.Equal(3, items.Select(x => x.GetProperty("id").GetGuid()).Distinct().Count());
        Assert.All(items, item =>
        {
            Assert.Equal(siteId, item.GetProperty("siteId").GetGuid());
            Assert.Equal(staff.AccountId, item.GetProperty("updatedBy").GetProperty("id").GetString());
        });

        using var renameScope = fixture.Factory.Services.CreateScope();
        var db = renameScope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var originalName = await db.Users.Where(user => user.Id == staff.AccountId)
            .Select(user => new { user.FirstName, user.LastName }).SingleAsync();
        await db.Users.Where(user => user.Id == staff.AccountId).ExecuteUpdateAsync(updates => updates
            .SetProperty(user => user.FirstName, "Renamed")
            .SetProperty(user => user.LastName, "Operator"));
        using var afterRenameRead = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates?pageSize=100");
        using var afterRenameBody = await afterRenameRead.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Integration Monitoring", afterRenameBody!.RootElement.GetProperty("items")[1].GetProperty("updatedBy").GetProperty("name").GetString());
        using var newReading = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Normal" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, newReading.StatusCode);
        using var newReadingBody = await newReading.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Renamed Operator", newReadingBody!.RootElement.GetProperty("updatedBy").GetProperty("name").GetString());
        await db.Users.Where(user => user.Id == staff.AccountId).ExecuteUpdateAsync(updates => updates
            .SetProperty(user => user.FirstName, originalName.FirstName)
            .SetProperty(user => user.LastName, originalName.LastName));
    }

    [Fact]
    public async Task Database_sequence_orders_updates_with_the_same_fixed_timestamp()
    {
        var fixedAt = new DateTimeOffset(2026, 10, 29, 4, 0, 0, TimeSpan.Zero);
        using var clockFactory = fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FixedTimeProvider(fixedAt));
        }));
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin, factory: clockFactory);
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff, factory: clockFactory);
        var siteId = await CreateSiteAsync(admin);

        foreach (var status in new[] { "Normal", "Low", "Unavailable" })
        {
            using var created = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status }, JsonOptions);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Equal(fixedAt, body!.RootElement.GetProperty("updatedAt").GetDateTimeOffset());
        }

        using var history = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(new[] { "Unavailable", "Low", "Normal" }, historyBody!.RootElement.GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("status").GetString()));
    }

    [Fact]
    public async Task Concurrent_writes_remain_in_history_and_latest_uses_the_database_sequence()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var siteId = await CreateSiteAsync(admin);
        var writes = await Task.WhenAll(new[] { "Normal", "Low", "Unavailable" }.Select(status =>
            staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status }, JsonOptions)));
        try
        {
            Assert.All(writes, response => Assert.Equal(HttpStatusCode.Created, response.StatusCode));
            var responseIds = new List<Guid>();
            foreach (var response in writes)
            {
                using var body = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
                responseIds.Add(body!.RootElement.GetProperty("id").GetGuid());
            }

            using var scope = fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
            var persisted = await db.SupplyUpdates.Where(update => update.SiteId == siteId)
                .OrderByDescending(update => update.Sequence)
                .Select(update => new { update.Id, update.Sequence, update.UpdatedAt })
                .ToListAsync();
            Assert.Equal(3, persisted.Count);
            Assert.Equal(3, persisted.Select(update => update.Sequence).Distinct().Count());
            Assert.Equal(responseIds.Order(), persisted.Select(update => update.Id).Order());

            using var history = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates?pageSize=100");
            using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Equal(persisted.Select(update => update.Id), historyBody!.RootElement.GetProperty("items").EnumerateArray()
                .Select(item => item.GetProperty("id").GetGuid()));

            using var detail = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}");
            using var detailBody = await detail.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Equal(persisted[0].Id, detailBody!.RootElement.GetProperty("latestSupply").GetProperty("id").GetGuid());
            Assert.Equal(persisted[0].UpdatedAt, detailBody.RootElement.GetProperty("latestSupply").GetProperty("updatedAt").GetDateTimeOffset());
        }
        finally
        {
            foreach (var response in writes) response.Dispose();
        }
    }

    [Fact]
    public async Task Personnel_can_list_details_and_history_with_latest_status_and_paging()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var siteId = await CreateSiteAsync(admin);

        using var defaults = await staff.Client.GetAsync("/api/staff/supply-sites");
        using var defaultsBody = await defaults.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(1, defaultsBody!.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(20, defaultsBody.RootElement.GetProperty("pageSize").GetInt32());

        var secondSiteId = await CreateSiteAsync(admin);
        using var allSitesScope = fixture.Factory.Services.CreateScope();
        var allSiteIds = await allSitesScope.ServiceProvider.GetRequiredService<AqoursDbContext>().SupplySites
            .OrderBy(site => site.Name).ThenBy(site => site.Id).Select(site => site.Id).ToListAsync();
        var sitePosition = allSiteIds.IndexOf(siteId);
        Assert.True(sitePosition >= 0);
        var secondSitePosition = allSiteIds.IndexOf(secondSiteId);
        Assert.True(secondSitePosition >= 0);
        var sitePage = sitePosition + 1;
        var secondSitePage = secondSitePosition + 1;
        using var sitePageResponse = await staff.Client.GetAsync($"/api/staff/supply-sites?page={sitePage}&pageSize=1");
        Assert.Equal(HttpStatusCode.OK, sitePageResponse.StatusCode);
        using var sitePageBody = await sitePageResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var sitePageRoot = sitePageBody!.RootElement;
        Assert.Equal(sitePage, sitePageRoot.GetProperty("page").GetInt32());
        Assert.Equal(1, sitePageRoot.GetProperty("pageSize").GetInt32());
        Assert.Equal(allSiteIds.Count, sitePageRoot.GetProperty("totalCount").GetInt32());
        var site = Assert.Single(sitePageRoot.GetProperty("items").EnumerateArray());
        Assert.Equal(siteId, site.GetProperty("id").GetGuid());
        using var secondSitePageResponse = await staff.Client.GetAsync($"/api/staff/supply-sites?page={secondSitePage}&pageSize=1");
        using var secondSitePageBody = await secondSitePageResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(secondSiteId, Assert.Single(secondSitePageBody!.RootElement.GetProperty("items").EnumerateArray())
            .GetProperty("id").GetGuid());
        Assert.Equal(secondSitePage, secondSitePageBody.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(1, secondSitePageBody.RootElement.GetProperty("pageSize").GetInt32());
        Assert.Equal(JsonValueKind.Null, site.GetProperty("latestSupply").ValueKind);
        Assert.True(site.TryGetProperty("name", out _));
        Assert.True(site.TryGetProperty("address", out _));
        Assert.True(site.TryGetProperty("latitude", out _));
        Assert.True(site.TryGetProperty("longitude", out _));

        using var noReadingDetail = await admin.Client.GetAsync($"/api/staff/supply-sites/{siteId}");
        Assert.Equal(HttpStatusCode.OK, noReadingDetail.StatusCode);
        using var noReadingBody = await noReadingDetail.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(JsonValueKind.Null, noReadingBody!.RootElement.GetProperty("latestSupply").ValueKind);

        foreach (var status in new[] { "Normal", "Low", "Unavailable" })
        {
            using var created = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status }, JsonOptions);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        }

        foreach (var client in new[] { admin.Client, staff.Client })
        {
            using var detail = await client.GetAsync($"/api/staff/supply-sites/{siteId}");
            Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
            using var detailBody = await detail.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            var latest = detailBody!.RootElement.GetProperty("latestSupply");
            Assert.Equal("Unavailable", latest.GetProperty("status").GetString());
            Assert.True(latest.GetProperty("updatedAt").GetDateTimeOffset() <= DateTimeOffset.UtcNow);

            var listPage = sitePosition / 100 + 1;
            using var list = await client.GetAsync($"/api/staff/supply-sites?page={listPage}&pageSize=100");
            Assert.Equal(HttpStatusCode.OK, list.StatusCode);
            using var listBody = await list.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Equal(listPage, listBody!.RootElement.GetProperty("page").GetInt32());
            var listedSite = Assert.Single(listBody.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == siteId);
            Assert.Equal("Unavailable", listedSite.GetProperty("latestSupply").GetProperty("status").GetString());
        }

        using var firstHistoryPage = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates?pageSize=2");
        Assert.Equal(HttpStatusCode.OK, firstHistoryPage.StatusCode);
        using var firstPageBody = await firstHistoryPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var firstPage = firstPageBody!.RootElement;
        Assert.Equal(1, firstPage.GetProperty("page").GetInt32());
        Assert.Equal(2, firstPage.GetProperty("pageSize").GetInt32());
        Assert.Equal(3, firstPage.GetProperty("totalCount").GetInt32());
        Assert.Equal(new[] { "Unavailable", "Low" }, firstPage.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("status").GetString()));

        using var secondHistoryPage = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates?page=2&pageSize=2");
        using var secondPageBody = await secondHistoryPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(new[] { "Normal" }, secondPageBody!.RootElement.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("status").GetString()));

        using var defaultHistory = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        using var defaultHistoryBody = await defaultHistory.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(1, defaultHistoryBody!.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(20, defaultHistoryBody.RootElement.GetProperty("pageSize").GetInt32());

        using var outOfRange = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates?page=2147483647&pageSize=2");
        using var outOfRangeBody = await outOfRange.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Empty(outOfRangeBody!.RootElement.GetProperty("items").EnumerateArray());

        using var missingSite = await staff.Client.GetAsync("/api/staff/supply-sites/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.NotFound, missingSite.StatusCode);
        using var missingHistory = await staff.Client.GetAsync("/api/staff/supply-sites/00000000-0000-0000-0000-000000000001/supply-updates");
        Assert.Equal(HttpStatusCode.NotFound, missingHistory.StatusCode);
        using var missingWrite = await staff.Client.PostAsJsonAsync("/api/staff/supply-sites/00000000-0000-0000-0000-000000000001/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.NotFound, missingWrite.StatusCode);
    }

    [Fact]
    public async Task Invalid_statuses_and_pagination_are_rejected_without_persisting_readings()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var siteId = await CreateSiteAsync(admin);
        var invalidBodies = new[]
        {
            "{}",
            "{\"status\":null}",
            "{\"status\":5}",
            "{\"status\":true}",
            "{\"status\":{}}",
            "{\"status\":\"normal\"}",
            "{\"status\":\"Unknown\"}",
            "{\"status\":\"\"}"
        };
        foreach (var body in invalidBodies)
        {
            using var rejected = await staff.Client.PostAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
            using var validation = await rejected.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(validation!.RootElement.GetProperty("errors").TryGetProperty("status", out _));
        }

        using var history = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(0, historyBody!.RootElement.GetProperty("totalCount").GetInt32());

        foreach (var (query, field) in new[]
        {
            ("page=0", "page"), ("page=-1", "page"), ("page=2147483648", "page"), ("page=nope", "page"),
            ("pageSize=0", "pageSize"), ("pageSize=-1", "pageSize"), ("pageSize=101", "pageSize"),
            ("pageSize=2147483648", "pageSize"), ("pageSize=nope", "pageSize")
        })
        {
            using var invalidPage = await staff.Client.GetAsync($"/api/staff/supply-sites?{query}");
            Assert.Equal(HttpStatusCode.BadRequest, invalidPage.StatusCode);
            using var invalidBody = await invalidPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(invalidBody!.RootElement.GetProperty("errors").TryGetProperty(field, out _));
        }
    }

    [Fact]
    public async Task Cookie_roles_and_csrf_protect_supply_monitoring_routes()
    {
        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousList = await anonymous.GetAsync("/api/staff/supply-sites");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);
        using var anonymousDetail = await anonymous.GetAsync("/api/staff/supply-sites/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousDetail.StatusCode);
        using var anonymousHistory = await anonymous.GetAsync("/api/staff/supply-sites/00000000-0000-0000-0000-000000000001/supply-updates");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousHistory.StatusCode);
        using var anonymousWrite = await anonymous.PostAsJsonAsync("/api/staff/supply-sites/00000000-0000-0000-0000-000000000001/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousWrite.StatusCode);

        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var site = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", SiteRequest("Monitor auth " + Guid.NewGuid().ToString("N")), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, site.StatusCode);
        using var siteBody = await site.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var siteId = siteBody!.RootElement.GetProperty("id").GetGuid();
        using var adminList = await admin.Client.GetAsync("/api/staff/supply-sites");
        Assert.Equal(HttpStatusCode.OK, adminList.StatusCode);
        using var adminDetail = await admin.Client.GetAsync($"/api/staff/supply-sites/{siteId}");
        Assert.Equal(HttpStatusCode.OK, adminDetail.StatusCode);
        using var adminHistory = await admin.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        Assert.Equal(HttpStatusCode.OK, adminHistory.StatusCode);
        using var adminWrite = await admin.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, adminWrite.StatusCode);

        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        using var staffWrite = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, staffWrite.StatusCode);

        using var noCsrf = await CreateWebSessionAsync(AccountRoles.Staff, csrfHeader: false);
        using var blockedWrite = await noCsrf.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Normal" }, JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, blockedWrite.StatusCode);
        noCsrf.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "invalid-token");
        using var invalidCsrfWrite = await noCsrf.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Normal" }, JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, invalidCsrfWrite.StatusCode);
        using var customer = await CreateCustomerClientAsync();
        using var customerList = await customer.GetAsync("/api/staff/supply-sites");
        Assert.Equal(HttpStatusCode.Unauthorized, customerList.StatusCode);
        using var customerDetail = await customer.GetAsync($"/api/staff/supply-sites/{siteId}");
        Assert.Equal(HttpStatusCode.Unauthorized, customerDetail.StatusCode);
        using var customerHistory = await customer.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        Assert.Equal(HttpStatusCode.Unauthorized, customerHistory.StatusCode);
        using var customerWrite = await customer.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, customerWrite.StatusCode);

        using var restrictedAdmin = await CreateRestrictedWebClientAsync(AccountRoles.Admin);
        using var restrictedStaff = await CreateRestrictedWebClientAsync(AccountRoles.Staff);
        foreach (var restricted in new[] { restrictedAdmin, restrictedStaff })
        {
            using var deniedList = await restricted.GetAsync("/api/staff/supply-sites");
            Assert.Equal(HttpStatusCode.Forbidden, deniedList.StatusCode);
            using var deniedDetail = await restricted.GetAsync($"/api/staff/supply-sites/{siteId}");
            Assert.Equal(HttpStatusCode.Forbidden, deniedDetail.StatusCode);
            using var deniedHistory = await restricted.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
            Assert.Equal(HttpStatusCode.Forbidden, deniedHistory.StatusCode);
            using var deniedWrite = await restricted.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Low" }, JsonOptions);
            Assert.Equal(HttpStatusCode.Forbidden, deniedWrite.StatusCode);
        }
    }

    [Fact]
    public async Task Site_edits_and_supply_updates_keep_independent_timestamps_and_reading_history()
    {
        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var request = SiteRequest("Monitor interleave " + Guid.NewGuid().ToString("N"));
        using var created = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", request, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdBody = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var siteId = createdBody!.RootElement.GetProperty("id").GetGuid();
        var createdAt = createdBody.RootElement.GetProperty("updatedAt").GetDateTimeOffset();

        using var reading = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, reading.StatusCode);
        using var readingBody = await reading.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var readingId = readingBody!.RootElement.GetProperty("id").GetGuid();
        var readingAt = readingBody.RootElement.GetProperty("updatedAt").GetDateTimeOffset();
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
            var siteAfterReading = await db.SupplySites.SingleAsync(site => site.Id == siteId);
            Assert.Equal(createdAt, siteAfterReading.UpdatedAt);
        }

        var editRequest = request with { Name = request.Name + " edited", Address = request.Address with { Details = "Updated access road" } };
        var concurrentResponses = await Task.WhenAll(
            admin.Client.PutAsJsonAsync($"/api/admin/supply-sites/{siteId}", editRequest, JsonOptions),
            staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Normal" }, JsonOptions));
        using var edited = concurrentResponses[0];
        using var concurrentReading = concurrentResponses[1];
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal(HttpStatusCode.Created, concurrentReading.StatusCode);
        using var editedBody = await edited.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        using var concurrentReadingBody = await concurrentReading.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var editedAt = editedBody!.RootElement.GetProperty("updatedAt").GetDateTimeOffset();
        Assert.True(editedAt >= createdAt);
        Assert.Equal(readingAt, readingBody.RootElement.GetProperty("updatedAt").GetDateTimeOffset());

        using var detail = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}");
        using var detailBody = await detail.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var detailRoot = detailBody!.RootElement;
        Assert.Equal(editRequest.Name, detailRoot.GetProperty("name").GetString());
        Assert.Equal("Updated access road", detailRoot.GetProperty("address").GetProperty("details").GetString());
        Assert.Equal("Normal", detailRoot.GetProperty("latestSupply").GetProperty("status").GetString());
        Assert.Equal(concurrentReadingBody!.RootElement.GetProperty("id").GetGuid(), detailRoot.GetProperty("latestSupply").GetProperty("id").GetGuid());
        Assert.Equal(editedAt, detailRoot.GetProperty("updatedAt").GetDateTimeOffset());

        using var secondReading = await staff.Client.PostAsJsonAsync($"/api/staff/supply-sites/{siteId}/supply-updates", new { status = "Normal" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, secondReading.StatusCode);
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
            var siteAfterSecondReading = await db.SupplySites.SingleAsync(site => site.Id == siteId);
            Assert.Equal(editedAt, siteAfterSecondReading.UpdatedAt);
        }

        using var history = await staff.Client.GetAsync($"/api/staff/supply-sites/{siteId}/supply-updates");
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var updates = historyBody!.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, updates.Length);
        Assert.Equal(new[] { "Normal", "Normal", "Low" }, updates.Select(update => update.GetProperty("status").GetString()));
        Assert.Contains(updates, update => update.GetProperty("id").GetGuid() == readingId);
    }

    private async Task<Guid> CreateSiteAsync(WebClient admin)
    {
        using var response = await admin.Client.PostAsJsonAsync("/api/admin/supply-sites", SiteRequest("Monitor " + Guid.NewGuid().ToString("N")), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return body!.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<WebClient> CreateWebSessionAsync(string role, bool csrfHeader = true, WebApplicationFactory<Program>? factory = null)
    {
        var email = $"supply-monitor-{Guid.NewGuid():N}@aqours.test";
        var app = factory ?? fixture.Factory;
        var accountId = await CreateAccountAsync(email, role, app);
        var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
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

    private async Task<HttpClient> CreateCustomerClientAsync()
    {
        var email = $"supply-monitor-customer-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(email, AccountRoles.Customer);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var login = await client.PostAsJsonAsync("/api/auth/mobile/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var body = await login.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", body!.RootElement.GetProperty("accessToken").GetString());
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

    private async Task<HttpClient> CreateRestrictedWebClientAsync(string role)
    {
        var email = $"supply-monitor-restricted-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(email, role);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", await GetCsrfAsync(client));
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private async Task<string> CreateAccountAsync(string email, string role, WebApplicationFactory<Program>? factory = null)
    {
        using var scope = (factory ?? fixture.Factory).Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>()
            .CreateAsync(new(email, "Integration", "Test", "Monitoring", ApiFixture.AdminPassword, role));
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

    private static SupplySiteRequest SiteRequest(string name) => new(name,
        new("0100000000", "0102800000", "0102801000", null, "0102801001", "Near the old bridge"), 14.5, 121.2);

    private sealed record SupplySiteRequest(string? Name, SiteAddressRequest Address, double? Latitude, double? Longitude);
    private sealed record SiteAddressRequest(string? RegionCode, string? ProvinceCode, string? CityMunicipalityCode,
        string? SubMunicipalityCode, string? BarangayCode, string? Details);

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class WebClient(HttpClient client, string accountId) : IDisposable
    {
        public HttpClient Client { get; } = client;
        public string AccountId { get; } = accountId;
        public void Dispose() => Client.Dispose();
    }
}
