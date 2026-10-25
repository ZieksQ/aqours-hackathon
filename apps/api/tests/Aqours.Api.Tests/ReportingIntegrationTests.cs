using System.Net;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class ReportingIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Customer_can_submit_and_read_a_persisted_report_with_canonical_address_names()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customer = await CreateAuthenticatedCustomerAsync(client);
        var request = ReportRequest("LowPressure", 0, 0);
        var requestedAt = DateTimeOffset.UtcNow;

        using var created = await client.PostAsJsonAsync("/api/reports", request, JsonOptions);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.NotNull(created.Headers.Location);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var report = body!.RootElement;
        var id = report.GetProperty("id").GetGuid();
        var createdAt = report.GetProperty("createdAt").GetDateTimeOffset();
        Assert.Equal("LowPressure", report.GetProperty("issueType").GetString());
        Assert.Equal("Water is barely flowing.", report.GetProperty("description").GetString());
        Assert.Equal("Submitted", report.GetProperty("status").GetString());
        Assert.Equal(0, report.GetProperty("latitude").GetDouble());
        Assert.Equal(0, report.GetProperty("longitude").GetDouble());
        Assert.InRange(createdAt, requestedAt.AddSeconds(-1), DateTimeOffset.UtcNow.AddSeconds(5));
        Assert.Equal(TimeSpan.Zero, createdAt.Offset);
        Assert.Equal(id, GetLocationId(created.Headers.Location!));

        var address = report.GetProperty("address");
        Assert.Equal("0100000000", address.GetProperty("regionCode").GetString());
        Assert.Equal("Region I (Ilocos Region)", address.GetProperty("regionName").GetString());
        Assert.Equal("0102800000", address.GetProperty("provinceCode").GetString());
        Assert.Equal("Ilocos Norte", address.GetProperty("provinceName").GetString());
        Assert.Equal("0102801000", address.GetProperty("cityMunicipalityCode").GetString());
        Assert.Equal("Adams", address.GetProperty("cityMunicipalityName").GetString());
        Assert.Equal("0102801001", address.GetProperty("barangayCode").GetString());
        Assert.Equal("Adams", address.GetProperty("barangayName").GetString());
        Assert.Equal("Near the old bridge", address.GetProperty("details").GetString());

        using var get = await client.GetAsync(created.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        using var getBody = await get.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(id, getBody!.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("Submitted", getBody.RootElement.GetProperty("status").GetString());
        Assert.Equal(createdAt, getBody.RootElement.GetProperty("createdAt").GetDateTimeOffset());
        Assert.False(getBody.RootElement.TryGetProperty("customerId", out _));

        using var scope = fixture.Factory.Services.CreateScope();
        var persisted = await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().Reports.SingleAsync(x => x.Id == id);
        Assert.Equal(customer.AccountId, persisted.CustomerId);
        Assert.Equal("LowPressure", persisted.IssueType.ToString());
        Assert.Equal("Water is barely flowing.", persisted.Description);
        Assert.Equal("Submitted", persisted.Status.ToString());
        Assert.Equal(createdAt, persisted.CreatedAt);
        Assert.Equal(0, persisted.Latitude);
        Assert.Equal(0, persisted.Longitude);
        Assert.Equal("0100000000", persisted.Address.RegionCode);
        Assert.Equal("Region I (Ilocos Region)", persisted.Address.RegionName);
        Assert.Equal("Adams", persisted.Address.BarangayName);
    }

    [Fact]
    public async Task Report_access_requires_a_full_customer_bearer_session_and_is_owner_scoped()
    {
        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousList = await anonymous.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);
        using var anonymousSubmit = await anonymous.PostAsJsonAsync("/api/reports", ReportRequest("NoWater", 14.5, 121.2), JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousSubmit.StatusCode);
        using var anonymousRead = await anonymous.GetAsync("/api/reports/00000000-0000-0000-0000-000000000001");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);

        var ownerClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var owner = await CreateAuthenticatedCustomerAsync(ownerClient);
        var otherClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await CreateAuthenticatedCustomerAsync(otherClient);
        using var created = await ownerClient.PostAsJsonAsync("/api/reports", ReportRequest("NoWater", 14.5, 121.2), JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var reportId = body!.RootElement.GetProperty("id").GetGuid();

        using var otherRead = await otherClient.GetAsync($"/api/reports/{reportId}");
        Assert.Equal(HttpStatusCode.NotFound, otherRead.StatusCode);
        using var otherList = await otherClient.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.OK, otherList.StatusCode);
        using var otherItems = await otherList.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(0, otherItems!.RootElement.GetProperty("totalCount").GetInt32());

        ownerClient.DefaultRequestHeaders.Authorization = null;
        ownerClient.DefaultRequestHeaders.Authorization = new("Bearer", "not-a-jwt");
        using var invalidToken = await ownerClient.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, invalidToken.StatusCode);
        string ownerStamp;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var account = await scope.ServiceProvider.GetRequiredService<AccountService>().FindAsync(owner.AccountId);
            ownerStamp = account!.SecurityStamp;
        }
        ownerClient.DefaultRequestHeaders.Authorization = new("Bearer", ExpiredCustomerToken(owner.AccountId, ownerStamp));
        using var expiredToken = await ownerClient.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, expiredToken.StatusCode);

        var restrictedClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var restricted = await LoginCustomerAsync(restrictedClient);
        restrictedClient.DefaultRequestHeaders.Authorization = new("Bearer", restricted.AccessToken);
        using var restrictedSubmit = await restrictedClient.PostAsJsonAsync("/api/reports", ReportRequest("NoWater", null, null), JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, restrictedSubmit.StatusCode);
        using var restrictedList = await restrictedClient.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedList.StatusCode);
        using var restrictedRead = await restrictedClient.GetAsync($"/api/reports/{reportId}");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedRead.StatusCode);

        var staffClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var staffEmail = NewEmail("report-staff");
        var staffId = await CreateAccountAsync(staffEmail, AccountRoles.Staff);
        string staffStamp;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var staffAccount = await scope.ServiceProvider.GetRequiredService<AccountService>().FindAsync(staffId);
            staffStamp = staffAccount!.SecurityStamp;
        }
        staffClient.DefaultRequestHeaders.Authorization = new("Bearer", SignedToken(staffId, AccountRoles.Staff, staffStamp));
        using var staffSubmit = await staffClient.PostAsJsonAsync("/api/reports", ReportRequest("NoWater", 14.5, 121.2), JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, staffSubmit.StatusCode);
        using var staffList = await staffClient.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, staffList.StatusCode);
        using var staffRead = await staffClient.GetAsync($"/api/reports/{reportId}");
        Assert.Equal(HttpStatusCode.Unauthorized, staffRead.StatusCode);

        // Web cookie authentication must not satisfy the customer mobile bearer policy.
        using var webClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var csrf = await GetCsrfAsync(webClient);
        webClient.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var webLogin = await webClient.PostAsJsonAsync("/api/auth/web/login",
            new LoginRequest(ApiFixture.AdminEmail, ApiFixture.AdminPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, webLogin.StatusCode);
        using var cookieRequest = await webClient.GetAsync("/api/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, cookieRequest.StatusCode);
    }

    [Fact]
    public async Task Report_validation_checks_required_text_coordinates_and_canonical_hierarchy()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await CreateAuthenticatedCustomerAsync(client);

        var invalidRequests = new (object Request, string Field)[]
        {
            (ReportRequest("Unknown", 14.5, 121.2), "issueType"),
            (ReportRequest("NoWater", 90.0001, 0), "latitude"),
            (ReportRequest("NoWater", 0, -180.0001), "longitude"),
            (ReportRequest("NoWater", null, 121.2), "latitude"),
            (ReportRequest("NoWater", 14.5, null), "longitude"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Description = "  " }, "description"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Description = new string('x', 2001) }, "description"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Address = ReportAddress() with { Details = " " } }, "address.details"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Address = ReportAddress() with { Details = new string('x', 501) } }, "address.details"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Address = ReportAddress() with { CityMunicipalityCode = "0102802000" } }, "address.cityMunicipalityCode"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Address = ReportAddress() with { BarangayCode = "0102801002" } }, "address.barangayCode"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Address = ReportAddress() with { ProvinceCode = null } }, "address.provinceCode"),
            (ReportRequest("NoWater", 14.5, 121.2) with { Address = ReportAddress() with { RegionCode = "0200000000" } }, "address.regionCode"),
            (ReportRequest("NoWater", 14.5, 121.2) with
            {
                Address = new ReportAddressRequest("1300000000", null, "1380600000", null, "1380601001", "Tondo")
            }, "address.subMunicipalityCode"),
            (ReportRequest("NoWater", 14.5, 121.2) with
            {
                Address = new ReportAddressRequest("1300000000", null, "1380600000", "1380602000", "1380601001", "Tondo")
            }, "address.subMunicipalityCode")
        };

        foreach (var (request, field) in invalidRequests)
        {
            using var response = await client.PostAsJsonAsync("/api/reports", request, JsonOptions);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var validation = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(validation!.RootElement.GetProperty("errors").TryGetProperty(field, out _),
                $"Expected validation field '{field}' for {JsonSerializer.Serialize(request, JsonOptions)}.");
        }

        using var missingCoordinates = await client.PostAsync("/api/reports", JsonContent.Create(JsonDocument.Parse("""
            { "issueType": "NoWater", "description": "Water is out.", "address": {
              "regionCode": "0100000000", "provinceCode": "0102800000", "cityMunicipalityCode": "0102801000",
              "barangayCode": "0102801001", "details": "Near the old bridge" } }
            """), options: JsonOptions));
        Assert.Equal(HttpStatusCode.BadRequest, missingCoordinates.StatusCode);

        using var invalidIssueJson = await client.PostAsync("/api/reports", new StringContent("""
            { "issueType": 99, "description": "Water is out.", "latitude": 0, "longitude": 0 }
            """, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, invalidIssueJson.StatusCode);

        using var nonFinite = await client.PostAsync("/api/reports", new StringContent("""
            { "issueType": "NoWater", "description": "Water is out.", "address": {
              "regionCode": "0100000000", "provinceCode": "0102800000", "cityMunicipalityCode": "0102801000",
              "barangayCode": "0102801001", "details": "Near the old bridge" }, "latitude": 1e400, "longitude": 0 }
            """, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, nonFinite.StatusCode);

        using var whitespace = await client.PostAsJsonAsync("/api/reports",
            ReportRequest("DirtyWater", 90, 180) with
            {
                Description = "  Smells unusual.  ",
                Address = ReportAddress() with { Details = "  Outside unit 3.  " }
            }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, whitespace.StatusCode);
        using var normalized = await whitespace.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Smells unusual.", normalized!.RootElement.GetProperty("description").GetString());
        Assert.Equal("Outside unit 3.", normalized.RootElement.GetProperty("address").GetProperty("details").GetString());
        Assert.Equal(90, normalized.RootElement.GetProperty("latitude").GetDouble());
        Assert.Equal(180, normalized.RootElement.GetProperty("longitude").GetDouble());

        var maximumText = ReportRequest("LowPressure", -90, -180) with
        {
            Description = new string('d', 2000),
            Address = ReportAddress() with { Details = new string('a', 500) }
        };
        using var maximumResponse = await client.PostAsJsonAsync("/api/reports", maximumText, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, maximumResponse.StatusCode);
        using var maximumBody = await maximumResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(2000, maximumBody!.RootElement.GetProperty("description").GetString()!.Length);
        Assert.Equal(500, maximumBody.RootElement.GetProperty("address").GetProperty("details").GetString()!.Length);
        Assert.Equal(-90, maximumBody.RootElement.GetProperty("latitude").GetDouble());
        Assert.Equal(-180, maximumBody.RootElement.GetProperty("longitude").GetDouble());

        var ncr = ReportRequest("NoWater", 14.6, 121.0) with
        {
            Address = new ReportAddressRequest("1300000000", null, "1380100000", null, "1380100001", "Caloocan")
        };
        using var ncrResponse = await client.PostAsJsonAsync("/api/reports", ncr, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, ncrResponse.StatusCode);
        using var ncrBody = await ncrResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var ncrAddress = ncrBody!.RootElement.GetProperty("address");
        Assert.Null(ncrAddress.GetProperty("provinceCode").GetString());
        Assert.Equal("City of Caloocan", ncrAddress.GetProperty("cityMunicipalityName").GetString());

        var manila = ReportRequest("NoWater", 14.6, 121.0) with
        {
            Address = new ReportAddressRequest("1300000000", null, "1380600000", "1380601000", "1380601001", "Tondo")
        };
        using var manilaResponse = await client.PostAsJsonAsync("/api/reports", manila, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, manilaResponse.StatusCode);
        using var manilaBody = await manilaResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var manilaAddress = manilaBody!.RootElement.GetProperty("address");
        Assert.Equal("City of Manila", manilaAddress.GetProperty("cityMunicipalityName").GetString());
        Assert.Equal("Tondo I/II", manilaAddress.GetProperty("subMunicipalityName").GetString());
        Assert.Equal("Barangay 1", manilaAddress.GetProperty("barangayName").GetString());
    }

    [Fact]
    public async Task Report_pagination_is_bounded_newest_first_and_breaks_timestamp_ties_by_id_descending()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await CreateAuthenticatedCustomerAsync(client);
        var ids = new List<Guid>();
        var creationTimes = new Dictionary<Guid, DateTimeOffset>();
        foreach (var issue in new[] { "NoWater", "LowPressure", "DirtyWater" })
        {
            using var created = await client.PostAsJsonAsync("/api/reports", ReportRequest(issue, 14.5, 121.2), JsonOptions);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            var item = body!.RootElement;
            var id = item.GetProperty("id").GetGuid();
            ids.Add(id);
            creationTimes.Add(id, item.GetProperty("createdAt").GetDateTimeOffset());
        }

        using (var defaultPage = await client.GetAsync("/api/reports"))
        {
            Assert.Equal(HttpStatusCode.OK, defaultPage.StatusCode);
            using var defaultBody = await defaultPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            var defaultRoot = defaultBody!.RootElement;
            Assert.Equal(1, defaultRoot.GetProperty("page").GetInt32());
            Assert.Equal(20, defaultRoot.GetProperty("pageSize").GetInt32());
            Assert.Equal(3, defaultRoot.GetProperty("totalCount").GetInt32());
            var expectedNewest = ids.OrderByDescending(id => creationTimes[id]).ThenByDescending(id => id);
            Assert.Equal(expectedNewest, defaultRoot.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()));
        }

        using (var outOfRangePage = await client.GetAsync("/api/reports?page=9&pageSize=2"))
        {
            Assert.Equal(HttpStatusCode.OK, outOfRangePage.StatusCode);
            using var outOfRangeBody = await outOfRangePage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Empty(outOfRangeBody!.RootElement.GetProperty("items").EnumerateArray());
            Assert.Equal(3, outOfRangeBody.RootElement.GetProperty("totalCount").GetInt32());
        }

        var tiedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE reports SET created_at = {tiedAt} WHERE id IN ({ids[0]}, {ids[1]}, {ids[2]})");
        }

        using var page = await client.GetAsync("/api/reports?page=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        using var pageBody = await page.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var root = pageBody!.RootElement;
        Assert.Equal(1, root.GetProperty("page").GetInt32());
        Assert.Equal(2, root.GetProperty("pageSize").GetInt32());
        Assert.Equal(3, root.GetProperty("totalCount").GetInt32());
        var expected = ids.OrderDescending().Take(2).ToArray();
        Assert.Equal(expected, root.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()));

        using var secondPage = await client.GetAsync("/api/reports?page=2&pageSize=2");
        using var secondBody = await secondPage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(new[] { ids.OrderDescending().Last() }, secondBody!.RootElement.GetProperty("items")
            .EnumerateArray().Select(item => item.GetProperty("id").GetGuid()));

        foreach (var query in new[] { "page=0", "page=-1", "pageSize=0", "pageSize=-1", "pageSize=101", "page=&pageSize=", "page=abc", "pageSize=2147483648" })
        {
            using var invalid = await client.GetAsync($"/api/reports?{query}");
            Assert.True(invalid.StatusCode == HttpStatusCode.BadRequest,
                $"Expected 400 for {query}, got {(int)invalid.StatusCode}: {await invalid.Content.ReadAsStringAsync()}");
            using var problem = await invalid.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.True(problem!.RootElement.GetProperty("errors").TryGetProperty(query.StartsWith("pageSize=") ? "pageSize" : "page", out _));
        }
    }

    private static ReportCreateRequest ReportRequest(string issue, double? latitude, double? longitude) =>
        new(issue, "Water is barely flowing.", ReportAddress(), latitude, longitude);

    private static ReportAddressRequest ReportAddress() =>
        new("0100000000", "0102800000", "0102801000", null, "0102801001", "Near the old bridge");

    private static Guid GetLocationId(Uri location) => Guid.Parse(location.OriginalString.TrimEnd('/').Split('/')[^1]);

    private static string NewEmail(string prefix) => $"{prefix}-{Guid.NewGuid():N}@aqours.test";

    private static string ExpiredCustomerToken(string accountId, string stamp) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        ApiFixture.Issuer,
        ApiFixture.Audience,
        [new Claim("sub", accountId), new Claim("role", AccountRoles.Customer), new Claim(AuthConfiguration.Restricted, "false"), new Claim(AuthConfiguration.Stamp, stamp)],
        DateTime.UtcNow.AddMinutes(-30),
        DateTime.UtcNow.AddMinutes(-20),
        new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)), SecurityAlgorithms.HmacSha256)));

    private static string SignedToken(string accountId, string role, string stamp) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        ApiFixture.Issuer,
        ApiFixture.Audience,
        [new Claim("sub", accountId), new Claim("role", role), new Claim(AuthConfiguration.Restricted, "false"), new Claim(AuthConfiguration.Stamp, stamp)],
        DateTime.UtcNow.AddMinutes(-1),
        DateTime.UtcNow.AddMinutes(5),
        new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)), SecurityAlgorithms.HmacSha256)));

    private async Task<CustomerSession> CreateAuthenticatedCustomerAsync(HttpClient client)
    {
        var email = NewEmail("report-customer");
        var accountId = await CreateAccountAsync(email, AccountRoles.Customer);
        return await ChangeCustomerPasswordAsync(client, email, accountId);
    }

    private async Task<CustomerSession> ChangeCustomerPasswordAsync(HttpClient client, string email, string accountId)
    {
        using var login = await client.PostAsJsonAsync("/api/auth/mobile/login", new LoginRequest(email, ApiFixture.AdminPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginBody = await login.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var restrictedToken = loginBody!.RootElement.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization = new("Bearer", restrictedToken);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var body = await changed.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var session = new CustomerSession(accountId, body!.RootElement.GetProperty("accessToken").GetString()!);
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        return session;
    }

    private async Task<CustomerSession> LoginCustomerAsync(HttpClient client)
    {
        var email = NewEmail("report-restricted");
        var accountId = await CreateAccountAsync(email, AccountRoles.Customer);
        using var login = await client.PostAsJsonAsync("/api/auth/mobile/login", new LoginRequest(email, ApiFixture.AdminPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var body = await login.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return new CustomerSession(accountId, body!.RootElement.GetProperty("accessToken").GetString()!);
    }

    private async Task<string> CreateAccountAsync(string email, string role)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>()
            .CreateAsync(new(email, "Reporting", null, "Integration", ApiFixture.AdminPassword, role));
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

    private sealed record CustomerSession(string AccountId, string AccessToken);
    private sealed record ReportCreateRequest(string IssueType, string Description, ReportAddressRequest Address, double? Latitude, double? Longitude);
    private sealed record ReportAddressRequest(string RegionCode, string? ProvinceCode, string CityMunicipalityCode, string? SubMunicipalityCode, string BarangayCode, string Details);
    private sealed record LoginRequest(string Email, string Password);
    private sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
}
