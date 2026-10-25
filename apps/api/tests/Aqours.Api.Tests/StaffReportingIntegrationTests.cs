using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class StaffReportingIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Queue_filters_and_detail_return_supplier_workflow_data()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var unassigned = await CreateReportAsync("queue-unassigned");
        var assigned = await CreateReportAsync("queue-assigned");
        using var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{assigned}/claim", new { }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var all = await staff.Client.GetAsync("/api/staff/reports?tab=all&page=1&pageSize=100");
        Assert.Equal(HttpStatusCode.OK, all.StatusCode);
        using var allBody = await all.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Contains(allBody!.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == unassigned);
        Assert.Contains(allBody.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == assigned);

        using var queue = await staff.Client.GetAsync($"/api/staff/reports?tab=unassigned&priority=Normal&assignment=unassigned&search={unassigned}");
        Assert.Equal(HttpStatusCode.OK, queue.StatusCode);
        using var queueBody = await queue.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var items = queueBody!.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Single(items);
        Assert.Equal(unassigned, items[0].GetProperty("id").GetGuid());
        Assert.Equal("Normal", items[0].GetProperty("priority").GetString());

        foreach (var term in new[] { "No%20water", "old%20bridge", "Integration%20Staff" })
        {
            using var searched = await staff.Client.GetAsync($"/api/staff/reports?tab=unassigned&search={term}");
            Assert.Equal(HttpStatusCode.OK, searched.StatusCode);
            using var searchedBody = await searched.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Contains(searchedBody!.RootElement.GetProperty("items").EnumerateArray(),
                item => item.GetProperty("id").GetGuid() == unassigned);
        }

        using var invalidTab = await staff.Client.GetAsync("/api/staff/reports?tab=unknown");
        Assert.Equal(HttpStatusCode.BadRequest, invalidTab.StatusCode);
        using var invalidStatus = await staff.Client.GetAsync("/api/staff/reports?status=Unknown");
        Assert.Equal(HttpStatusCode.BadRequest, invalidStatus.StatusCode);

        using var invalidPriority = await staff.Client.GetAsync("/api/staff/reports?priority=Urgent");
        Assert.Equal(HttpStatusCode.BadRequest, invalidPriority.StatusCode);

        using var detail = await staff.Client.GetAsync($"/api/staff/reports/{assigned}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var detailBody = await detail.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(assigned, detailBody!.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("InProgress", detailBody.RootElement.GetProperty("status").GetString());
        Assert.Equal(staff.AccountId, detailBody.RootElement.GetProperty("assignedStaff").GetProperty("id").GetString());
        Assert.Contains("report-queue-assigned-", detailBody.RootElement.GetProperty("customer").GetProperty("email").GetString());
    }

    [Fact]
    public async Task Claims_are_atomic_and_only_the_assignee_can_change_or_message_a_report()
    {
        using var first = await CreateWebSessionAsync(AccountRoles.Staff);
        using var second = await CreateWebSessionAsync(AccountRoles.Staff);
        var reportId = await CreateReportAsync("claim-race");

        var claims = await Task.WhenAll(
            first.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions),
            second.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions));
        try
        {
            Assert.Single(claims, response => response.IsSuccessStatusCode);
            Assert.Single(claims, response => response.StatusCode == HttpStatusCode.Conflict);
        }
        finally { foreach (var response in claims) response.Dispose(); }

        using var third = await CreateWebSessionAsync(AccountRoles.Staff);
        using var unassignedWrite = await third.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = "I will take a look." }, JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, unassignedWrite.StatusCode);

        var assignee = await GetAssignedStaffId(reportId);
        var owner = assignee == first.AccountId ? first : second;
        using var priority = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/priority", new { priority = "High" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, priority.StatusCode);
        using var lowPriority = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/priority", new { priority = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, lowPriority.StatusCode);
        using var lowBody = await lowPriority.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Low", lowBody!.RootElement.GetProperty("priority").GetString());
        using var status = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        using var invalidPriority = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/priority", new { priority = "Urgent" }, JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, invalidPriority.StatusCode);
        using var repeatedResolve = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, repeatedResolve.StatusCode);
    }

    [Fact]
    public async Task Cookie_role_and_csrf_rules_protect_staff_endpoints_and_admin_is_read_only()
    {
        var reportId = await CreateReportAsync("authz");
        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousList = await anonymous.GetAsync("/api/staff/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);

        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var adminList = await admin.Client.GetAsync("/api/staff/reports?tab=all");
        Assert.Equal(HttpStatusCode.OK, adminList.StatusCode);
        using var adminWrite = await admin.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, adminWrite.StatusCode);

        using var noCsrf = await CreateWebSessionAsync(AccountRoles.Staff, csrfHeader: false);
        using var blocked = await noCsrf.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);

        using var restricted = await CreateRestrictedWebClientAsync();
        using var restrictedList = await restricted.GetAsync("/api/staff/reports");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedList.StatusCode);
    }

    [Fact]
    public async Task Customer_and_staff_messages_are_persisted_ordered_and_customer_access_stays_owner_scoped()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var (customer, reportId) = await CreateReportSessionAsync("conversation");
        using (var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var staffMessage = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = "We are checking the supply." }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, staffMessage.StatusCode);
        using var customerReply = await customer.PostAsJsonAsync($"/api/reports/{reportId}/messages", new { body = "Thank you." }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, customerReply.StatusCode);

        using var history = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/messages?pageSize=1");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var root = historyBody!.RootElement;
        Assert.True(root.GetProperty("nextBefore").GetInt64() > 0);
        Assert.Equal("Thank you.", root.GetProperty("items")[0].GetProperty("body").GetString());
        using var next = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/messages?pageSize=1&before={root.GetProperty("nextBefore").GetInt64()}");
        using var nextBody = await next.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("We are checking the supply.", nextBody!.RootElement.GetProperty("items")[0].GetProperty("body").GetString());

        foreach (var invalid in new[] { "", "   ", new string('x', 2001) })
        {
            using var rejected = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = invalid }, JsonOptions);
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }
        using var normalizedMessage = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = "  Spaces are trimmed.  " }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, normalizedMessage.StatusCode);
        using var normalizedBody = await normalizedMessage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Spaces are trimmed.", normalizedBody!.RootElement.GetProperty("body").GetString());
        using var maxLengthMessage = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = new string('x', 2000) }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, maxLengthMessage.StatusCode);
        using var maxLengthBody = await maxLengthMessage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(2000, maxLengthBody!.RootElement.GetProperty("body").GetString()!.Length);

        using var customerMessages = await customer.GetAsync($"/api/reports/{reportId}/messages");
        Assert.Equal(HttpStatusCode.OK, customerMessages.StatusCode);
        using var stranger = await CreateCustomerClientAsync("conversation-stranger");
        using var hidden = await stranger.GetAsync($"/api/reports/{reportId}/messages");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);

        using var resolve = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, resolve.StatusCode);
        using var blockedReply = await customer.PostAsJsonAsync($"/api/reports/{reportId}/messages", new { body = "More details" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, blockedReply.StatusCode);

        using var invalidHistory = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/messages?before=0&pageSize=101");
        Assert.Equal(HttpStatusCode.BadRequest, invalidHistory.StatusCode);

        var concurrencyReport = await CreateReportSessionAsync("message-resolve-race");
        using (var claimRaceReport = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{concurrencyReport.ReportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claimRaceReport.StatusCode);
        var resolutionRace = await Task.WhenAll(
            staff.Client.PostAsJsonAsync($"/api/staff/reports/{concurrencyReport.ReportId}/status", new { status = "Resolved" }, JsonOptions),
            concurrencyReport.Client.PostAsJsonAsync($"/api/reports/{concurrencyReport.ReportId}/messages", new { body = "Concurrent customer note." }, JsonOptions));
        try
        {
            Assert.Equal(HttpStatusCode.OK, resolutionRace[0].StatusCode);
            Assert.Contains(resolutionRace[1].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        }
        finally { foreach (var response in resolutionRace) response.Dispose(); }
        using var afterResolution = await concurrencyReport.Client.PostAsJsonAsync($"/api/reports/{concurrencyReport.ReportId}/messages", new { body = "Must not be accepted." }, JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, afterResolution.StatusCode);
        concurrencyReport.Client.Dispose();
    }

    private async Task<Guid> CreateReportAsync(string suffix)
    {
        var (client, reportId) = await CreateReportSessionAsync(suffix);
        client.Dispose();
        return reportId;
    }

    private async Task<(HttpClient Client, Guid ReportId)> CreateReportSessionAsync(string suffix)
    {
        var client = await CreateCustomerClientAsync("report-" + suffix);
        using var created = await client.PostAsJsonAsync("/api/reports", new
        {
            issueType = "NoWater",
            description = "Report for " + suffix,
            address = new { regionCode = "0100000000", provinceCode = "0102800000", cityMunicipalityCode = "0102801000", barangayCode = "0102801001", details = "Near the old bridge" },
            latitude = 14.5,
            longitude = 121.2
        }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return (client, body!.RootElement.GetProperty("id").GetGuid());
    }

    private async Task<HttpClient> CreateCustomerClientAsync(string prefix)
    {
        var email = $"{prefix}-{Guid.NewGuid():N}@aqours.test";
        var accountId = await CreateAccountAsync(email, AccountRoles.Customer);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var login = await client.PostAsJsonAsync("/api/auth/mobile/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginBody = await login.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", loginBody!.RootElement.GetProperty("accessToken").GetString());
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = ApiFixture.AdminPassword, newPassword = ApiFixture.ChangedPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var changedBody = await changed.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", changedBody!.RootElement.GetProperty("accessToken").GetString());
        return client;
    }

    private async Task<WebClient> CreateWebSessionAsync(string role, bool csrfHeader = true)
    {
        var email = $"staff-test-{Guid.NewGuid():N}@aqours.test";
        var accountId = await CreateAccountAsync(email, role);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = ApiFixture.AdminPassword, newPassword = ApiFixture.ChangedPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        if (csrfHeader) client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        return new WebClient(client, accountId);
    }

    private async Task<HttpClient> CreateRestrictedWebClientAsync()
    {
        var email = $"restricted-staff-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(email, AccountRoles.Staff);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", await GetCsrfAsync(client));
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private async Task<string> CreateAccountAsync(string email, string role)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>()
            .CreateAsync(new(email, "Integration", "Test", "Staff", ApiFixture.AdminPassword, role));
        Assert.True(result.Succeeded, string.Join("; ", result.Errors?.SelectMany(errors => errors.Value) ?? []));
        return result.Value!.Account.Id;
    }

    private async Task<string> GetAssignedStaffId(Guid reportId)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().Reports.SingleAsync(x => x.Id == reportId)).AssignedStaffId!;
    }

    private static async Task<string> GetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/web/csrf");
        response.EnsureSuccessStatusCode();
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return body!.RootElement.GetProperty("requestToken").GetString()!;
    }

    private sealed class WebClient(HttpClient client, string accountId) : IDisposable
    {
        public HttpClient Client { get; } = client;
        public string AccountId { get; } = accountId;
        public static implicit operator HttpClient(WebClient value) => value.Client;
        public void Dispose() => Client.Dispose();
    }
}
