using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Aqours.Api;
using Aqours.Api.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Aqours.Infrastructure.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace Aqours.Api.Tests;

[CollectionDefinition("PostgreSQL authentication integration", DisableParallelization = true)]
public sealed class AuthenticationCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "PostgreSQL authentication integration";
}

public sealed class ApiFixture : IAsyncLifetime
{
    private const string ExpectedDatabase = "aqours_auth_integration_tests";
    public const string Issuer = "aqours-integration-tests";
    public const string Audience = "aqours-integration-client";
    public const string SigningKey = "test-signing-key-is-at-least-32-bytes-long";
    public const string AdminEmail = "seed-admin@aqours.test";
    public const string AdminPassword = "InitialPassword#2026A";
    public const string ChangedPassword = "ChangedPassword#2026B";

    private WebApplicationFactory<Program>? _factory;
    public WebApplicationFactory<Program> Factory => _factory ?? throw new InvalidOperationException("Fixture is not initialized.");
    public string ConnectionString { get; private set; } = "";

    public async Task InitializeAsync()
    {
        ConnectionString = Environment.GetEnvironmentVariable("AQOURS_TEST_CONNECTION_STRING")
            ?? throw new InvalidOperationException("Set AQOURS_TEST_CONNECTION_STRING to the dedicated PostgreSQL test database.");
        var connection = new NpgsqlConnectionStringBuilder(ConnectionString);
        if (!string.Equals(connection.Database, ExpectedDatabase, StringComparison.Ordinal))
            throw new InvalidOperationException($"Integration tests only run against the dedicated '{ExpectedDatabase}' database.");

        var options = new DbContextOptionsBuilder<AqoursDbContext>()
            .UseNpgsql(ConnectionString)
            .UseSnakeCaseNamingConvention()
            .Options;
        await using (var db = new AqoursDbContext(options))
        {
            await db.Database.MigrateAsync();
            await db.Database.MigrateAsync();
        }

        var testConfiguration = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Aqours"] = ConnectionString,
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            ["Jwt:SigningKey"] = SigningKey,
            ["SeedAdmin:Email"] = AdminEmail,
            ["SeedAdmin:FirstName"] = "Integration",
            ["SeedAdmin:LastName"] = "Admin",
            ["SeedAdmin:Password"] = AdminPassword
        };
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(testConfiguration));
        });
    }

    public async Task DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
    }
}

[Collection(AuthenticationCollection.Name)]
public sealed class AuthenticationIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Startup_is_repeatable_and_seeds_required_roles_once()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        var roles = await db.Roles.OrderBy(x => x.Name).Select(x => x.Name).ToListAsync();
        Assert.Equal([AccountRoles.Admin, AccountRoles.Customer, AccountRoles.Staff], roles);
        Assert.Equal(1, await db.Users.CountAsync(x => x.Email == ApiFixture.AdminEmail));

        await scope.ServiceProvider.GetRequiredService<IAccountSeeder>().SeedAsync();
        Assert.Equal(1, await db.Users.CountAsync(x => x.Email == ApiFixture.AdminEmail));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    [Fact]
    public async Task Admin_can_create_users_but_duplicate_email_is_rejected_case_insensitively()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var adminEmail = "admin-create-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateAccountAsync(adminEmail, AccountRoles.Admin);
        var csrf = await GetCsrfAsync(client);
        await LoginWebAsync(client, adminEmail, ApiFixture.AdminPassword, csrf);
        csrf = await GetCsrfAsync(client);
        using (var changed = await ChangePasswordAsync(client, "/api/auth/change-password", ApiFixture.AdminPassword, ApiFixture.ChangedPassword, csrf))
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        csrf = await GetCsrfAsync(client);
        var request = NewAccount("case-check-" + Guid.NewGuid().ToString("N") + "@aqours.test", AccountRoles.Staff);

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        using var missingCreateCsrf = await client.PostAsJsonAsync("/api/accounts", NewAccount("missing-csrf-" + Guid.NewGuid().ToString("N") + "@aqours.test", AccountRoles.Staff));
        Assert.Equal(HttpStatusCode.BadRequest, missingCreateCsrf.StatusCode);
        using var created = await PostJsonAsync(client, "/api/accounts", request, csrf);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var duplicate = await PostJsonAsync(client, "/api/accounts", request with { Email = request.Email.ToUpperInvariant() }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        using var duplicateBody = await duplicate.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var emailErrors = duplicateBody!.RootElement.GetProperty("errors").GetProperty("email");
        Assert.Equal(1, emailErrors.GetArrayLength());
        Assert.Equal("This email address is already in use.", emailErrors[0].GetString());
        using var invalidRole = await PostJsonAsync(client, "/api/accounts", request with { Email = "invalid-role@aqours.test", Role = "Owner" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, invalidRole.StatusCode);
        using var invalidName = await PostJsonAsync(client, "/api/accounts", request with { Email = "invalid-name@aqours.test", FirstName = " " }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, invalidName.StatusCode);

        foreach (var role in new[] { AccountRoles.Customer, AccountRoles.Admin })
        {
            using var roleResponse = await PostJsonAsync(client, "/api/accounts", NewAccount($"{role.ToLowerInvariant()}-{Guid.NewGuid():N}@aqours.test", role), csrf);
            Assert.Equal(HttpStatusCode.Created, roleResponse.StatusCode);
        }
    }

    [Fact]
    public async Task Staff_and_customers_cannot_create_accounts_and_restricted_admin_must_change_password()
    {
        var staffEmail = "staff-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        var adminEmail = "admin-restricted-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateAccountAsync(staffEmail, AccountRoles.Staff);
        await CreateAccountAsync(adminEmail, AccountRoles.Admin);

        using var staffClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var csrf = await GetCsrfAsync(staffClient);
        await LoginWebAsync(staffClient, staffEmail, ApiFixture.AdminPassword, csrf);
        csrf = await GetCsrfAsync(staffClient);
        using var staffCreate = await PostJsonAsync(staffClient, "/api/accounts", NewAccount("forbidden-staff@aqours.test", "Customer"), csrf);
        Assert.Equal(HttpStatusCode.Forbidden, staffCreate.StatusCode);

        var staffChange = await ChangePasswordAsync(staffClient, "/api/auth/change-password", ApiFixture.AdminPassword, ApiFixture.ChangedPassword, csrf);
        Assert.Equal(HttpStatusCode.OK, staffChange.StatusCode);
        csrf = await GetCsrfAsync(staffClient);
        using var fullStaffCreate = await PostJsonAsync(staffClient, "/api/accounts", NewAccount("full-staff@aqours.test", AccountRoles.Customer), csrf);
        Assert.Equal(HttpStatusCode.Forbidden, fullStaffCreate.StatusCode);

        using var anonymousClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousCreate = await anonymousClient.PostAsJsonAsync("/api/accounts", NewAccount("anonymous@aqours.test", "Customer"));
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousCreate.StatusCode);

        using var customerClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customerEmail = "create-denied-customer-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(customerEmail);
        var customerSession = await LoginMobileAsync(customerClient, customerEmail, ApiFixture.AdminPassword);
        customerClient.DefaultRequestHeaders.Authorization = new("Bearer", customerSession.AccessToken);
        using var customerCreate = await customerClient.PostAsJsonAsync("/api/accounts", NewAccount("customer-create@aqours.test", "Customer"));
        Assert.Equal(HttpStatusCode.Unauthorized, customerCreate.StatusCode);

        var freshClient = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        try
        {
            var restrictedCsrf = await GetCsrfAsync(freshClient);
            await LoginWebAsync(freshClient, adminEmail, ApiFixture.AdminPassword, restrictedCsrf);
            restrictedCsrf = await GetCsrfAsync(freshClient);
            using var restrictedCreate = await PostJsonAsync(freshClient, "/api/accounts", NewAccount("blocked-admin@aqours.test", "Customer"), restrictedCsrf);
            Assert.Equal(HttpStatusCode.Forbidden, restrictedCreate.StatusCode);
            using var changed = await ChangePasswordAsync(freshClient, "/api/auth/change-password", ApiFixture.AdminPassword, ApiFixture.ChangedPassword, restrictedCsrf);
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        }
        finally { freshClient.Dispose(); }
    }

    [Fact]
    public async Task Invalid_credentials_trigger_identity_lockout()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var email = "lockout-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateAccountAsync(email, AccountRoles.Staff);
        var request = new LoginRequest(email, "WrongPassword#2026A");
        var csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        for (var i = 0; i < 5; i++)
        {
            using var response = await client.PostAsJsonAsync("/api/auth/web/login", request);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        using var correct = await client.PostAsJsonAsync("/api/auth/web/login", new LoginRequest(email, ApiFixture.AdminPassword));
        Assert.Equal(HttpStatusCode.Unauthorized, correct.StatusCode);
    }

    [Fact]
    public async Task Web_login_sets_protected_cookie_and_requires_csrf_for_logout()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var csrfResponse = await client.GetAsync("/api/auth/web/csrf");
        csrfResponse.EnsureSuccessStatusCode();
        using var csrfBody = await csrfResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var csrf = csrfBody!.RootElement.GetProperty("requestToken").GetString()!;
        Assert.Contains(csrfResponse.Headers.GetValues("Set-Cookie"), value => value.Contains("Aqours.Csrf=") &&
            value.Contains("httponly", StringComparison.OrdinalIgnoreCase) && value.Contains("samesite=strict", StringComparison.OrdinalIgnoreCase));
        var adminEmail = "cookie-admin-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateAccountAsync(adminEmail, AccountRoles.Admin);
        using var missingLoginCsrf = await client.PostAsJsonAsync("/api/auth/web/login", new LoginRequest(adminEmail, ApiFixture.AdminPassword));
        Assert.Equal(HttpStatusCode.BadRequest, missingLoginCsrf.StatusCode);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new LoginRequest(adminEmail, ApiFixture.AdminPassword));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains(login.Headers.GetValues("Set-Cookie"), value => value.Contains("Aqours.Session=") &&
            value.Contains("httponly", StringComparison.OrdinalIgnoreCase) && value.Contains("samesite=lax", StringComparison.OrdinalIgnoreCase));
        var cookieOptions = fixture.Factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(AuthConfiguration.Cookie);
        Assert.Equal("Aqours.Session", cookieOptions.Cookie.Name);
        Assert.Equal(TimeSpan.FromHours(8), cookieOptions.ExpireTimeSpan);
        Assert.False(cookieOptions.SlidingExpiration);
        var ticketFormat = cookieOptions.TicketDataFormat;
        var initialTicket = UnprotectTicket(login.Headers.GetValues("Set-Cookie"), ticketFormat);
        Assert.False(initialTicket.Properties.IsPersistent);
        Assert.InRange((initialTicket.Properties.ExpiresUtc!.Value - DateTimeOffset.UtcNow).TotalMinutes, 9, 10);
        csrf = await GetCsrfAsync(client);

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        using var missingChangeCsrf = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, missingChangeCsrf.StatusCode);
        using var missing = await client.PostAsync("/api/auth/web/logout", null);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var changedTicket = UnprotectTicket(changed.Headers.GetValues("Set-Cookie"), ticketFormat);
        Assert.False(changedTicket.Properties.IsPersistent);
        Assert.InRange((changedTicket.Properties.ExpiresUtc!.Value - DateTimeOffset.UtcNow).TotalHours, 7.99, 8);
        csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var logout = await client.PostAsync("/api/auth/web/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Contains(logout.Headers.GetValues("Set-Cookie"), value => value.Contains("Aqours.Session=") &&
            value.Contains("httponly", StringComparison.OrdinalIgnoreCase) && value.Contains("samesite=lax", StringComparison.OrdinalIgnoreCase));
        using var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Customer_mobile_token_has_valid_signature_expiry_and_claims_and_rotates_refresh_token()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customer = "mobile-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(customer);
        var restricted = await LoginMobileAsync(client, customer, ApiFixture.AdminPassword);
        Assert.Null(restricted.RefreshToken);
        Assert.Null(restricted.RefreshTokenExpiresAt);
        client.DefaultRequestHeaders.Authorization = new("Bearer", restricted.AccessToken);
        using var change = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        var session = (await change.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = null;
        Assert.NotNull(session.RefreshToken);
        var token = new JwtSecurityTokenHandler().ReadJwtToken(session.AccessToken);
        var now = DateTime.UtcNow;
        Assert.Equal(ApiFixture.Issuer, token.Issuer);
        Assert.Contains(ApiFixture.Audience, token.Audiences);
        Assert.Equal(AccountRoles.Customer, token.Claims.Single(c => c.Type == "role").Value);
        Assert.NotEmpty(token.Claims.Single(c => c.Type == "jti").Value);
        Assert.True(token.ValidTo > now && token.ValidTo <= now.AddMinutes(16));
        var handler = new JwtSecurityTokenHandler();
        handler.ValidateToken(session.AccessToken, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = ApiFixture.Issuer,
            ValidateAudience = true,
            ValidAudience = ApiFixture.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        }, out _);
        var parts = session.AccessToken.Split('.');
        parts[2] = (parts[2][0] == 'a' ? "b" : "a") + parts[2][1..];
        var tampered = string.Join('.', parts);
        Assert.ThrowsAny<SecurityTokenException>(() => handler.ValidateToken(tampered, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = ApiFixture.Issuer,
            ValidateAudience = true,
            ValidAudience = ApiFixture.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        }, out _));

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var account = await scope.ServiceProvider.GetRequiredService<AccountService>().FindAsync(session.Account.Id);
            var expiredJwt = handler.WriteToken(new JwtSecurityToken(ApiFixture.Issuer, ApiFixture.Audience,
                [new Claim("sub", session.Account.Id), new Claim("role", AccountRoles.Customer),
                    new Claim(AuthConfiguration.Restricted, "false"), new Claim(AuthConfiguration.Stamp, account!.SecurityStamp)],
                DateTime.UtcNow.AddMinutes(-10), DateTime.UtcNow.AddMinutes(-5),
                new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)), SecurityAlgorithms.HmacSha256)));
            client.DefaultRequestHeaders.Authorization = new("Bearer", expiredJwt);
            using var expiredResponse = await client.GetAsync("/api/auth/me");
            Assert.Equal(HttpStatusCode.Unauthorized, expiredResponse.StatusCode);
            client.DefaultRequestHeaders.Authorization = null;
        }

        using var refreshResponse = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(session.RefreshToken!));
        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);
        var rotated = await refreshResponse.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions);
        Assert.NotNull(rotated?.RefreshToken);
        Assert.NotEqual(session.RefreshToken, rotated!.RefreshToken);
        using var oldTokenReplay = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(session.RefreshToken!));
        Assert.Equal(HttpStatusCode.Unauthorized, oldTokenReplay.StatusCode);
        using var revokedDescendant = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(rotated.RefreshToken!));
        Assert.Equal(HttpStatusCode.Unauthorized, revokedDescendant.StatusCode);
    }

    [Fact]
    public async Task Concurrent_refresh_replay_revokes_the_entire_family()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customer = "parallel-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(customer);
        var restricted = await LoginMobileAsync(client, customer, ApiFixture.AdminPassword);
        client.DefaultRequestHeaders.Authorization = new("Bearer", restricted.AccessToken);
        using var change = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        var session = (await change.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = null;
        var refresh = new RefreshRequest(session.RefreshToken!);
        var results = await Task.WhenAll(
            client.PostAsJsonAsync("/api/auth/mobile/refresh", refresh),
            client.PostAsJsonAsync("/api/auth/mobile/refresh", refresh));
        try
        {
            Assert.Equal(1, results.Count(response => response.StatusCode == HttpStatusCode.OK));
            Assert.Equal(1, results.Count(response => response.StatusCode == HttpStatusCode.Unauthorized));
            var winner = results.Single(response => response.StatusCode == HttpStatusCode.OK);
            var rotated = await winner.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions);
            using var descendant = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(rotated!.RefreshToken!));
            Assert.Equal(HttpStatusCode.Unauthorized, descendant.StatusCode);
        }
        finally { foreach (var response in results) response.Dispose(); }
    }

    [Fact]
    public async Task Expired_refresh_family_is_rejected()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customer = "expired-refresh-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(customer);
        var restricted = await LoginMobileAsync(client, customer, ApiFixture.AdminPassword);
        client.DefaultRequestHeaders.Authorization = new("Bearer", restricted.AccessToken);
        using var change = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        var session = (await change.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = null;

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(session.RefreshToken!)));
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
            var familyId = await db.Set<RefreshToken>().Where(token => token.Hash == hash).Select(token => token.FamilyId).SingleAsync();
            await db.Set<RefreshFamily>().Where(family => family.Id == familyId)
                .ExecuteUpdateAsync(set => set.SetProperty(family => family.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        }

        using var response = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(session.RefreshToken!));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Signed_tokens_with_wrong_signature_issuer_audience_subject_role_or_stamp_are_rejected()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customer = "claims-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(customer);
        var restricted = await LoginMobileAsync(client, customer, ApiFixture.AdminPassword);
        client.DefaultRequestHeaders.Authorization = new("Bearer", restricted.AccessToken);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var session = (await changed.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = null;

        string stamp;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var account = await scope.ServiceProvider.GetRequiredService<AccountService>().FindAsync(session.Account.Id);
            stamp = account!.SecurityStamp;
        }
        var invalidTokens = new[]
        {
            "not-a-jwt",
            SignedToken(session.Account.Id, AccountRoles.Customer, stamp, ApiFixture.Issuer, ApiFixture.Audience, "wrong-signing-key-is-32-bytes-long!"),
            SignedToken(session.Account.Id, AccountRoles.Customer, stamp, "wrong-issuer", ApiFixture.Audience, ApiFixture.SigningKey),
            SignedToken(session.Account.Id, AccountRoles.Customer, stamp, ApiFixture.Issuer, "wrong-audience", ApiFixture.SigningKey),
            SignedToken("missing-account", AccountRoles.Customer, stamp, ApiFixture.Issuer, ApiFixture.Audience, ApiFixture.SigningKey),
            SignedToken(session.Account.Id, AccountRoles.Staff, stamp, ApiFixture.Issuer, ApiFixture.Audience, ApiFixture.SigningKey),
            SignedToken(session.Account.Id, AccountRoles.Customer, "stale-security-stamp", ApiFixture.Issuer, ApiFixture.Audience, ApiFixture.SigningKey)
        };
        foreach (var token in invalidTokens)
        {
            client.DefaultRequestHeaders.Authorization = new("Bearer", token);
            using var response = await client.GetAsync("/api/auth/me");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        client.DefaultRequestHeaders.Authorization = null;
    }

    [Fact]
    public async Task Seed_conflict_does_not_promote_or_reset_existing_non_admin_account()
    {
        var email = "seed-conflict-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(email);
        using var conflictingFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Aqours"] = fixture.ConnectionString,
                ["Jwt:Issuer"] = ApiFixture.Issuer,
                ["Jwt:Audience"] = ApiFixture.Audience,
                ["Jwt:SigningKey"] = ApiFixture.SigningKey,
                ["SeedAdmin:Email"] = email,
                ["SeedAdmin:FirstName"] = "ShouldNot",
                ["SeedAdmin:LastName"] = "Promote",
                ["SeedAdmin:Password"] = "ReplacementPassword#2026"
            }));
        });
        Assert.Throws<InvalidOperationException>(() => conflictingFactory.CreateClient());

        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>().LoginAsync(email, ApiFixture.AdminPassword, mobile: true);
        Assert.True(result.Succeeded);
        Assert.Equal(AccountRoles.Customer, result.Value!.Account.Role);
    }

    [Fact]
    public async Task Production_web_auth_cookies_are_secure()
    {
        var configuration = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Aqours"] = fixture.ConnectionString,
            ["Jwt:Issuer"] = ApiFixture.Issuer,
            ["Jwt:Audience"] = ApiFixture.Audience,
            ["Jwt:SigningKey"] = ApiFixture.SigningKey,
            ["SeedAdmin:Email"] = ApiFixture.AdminEmail,
            ["SeedAdmin:FirstName"] = "Integration",
            ["SeedAdmin:LastName"] = "Admin",
            ["SeedAdmin:Password"] = ApiFixture.AdminPassword
        };
        using var productionFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(configuration));
        });
        using var client = productionFactory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost")
        });
        using var csrfResponse = await client.GetAsync("/api/auth/web/csrf");
        csrfResponse.EnsureSuccessStatusCode();
        using var body = await csrfResponse.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", body!.RootElement.GetProperty("requestToken").GetString());
        using var login = await client.PostAsJsonAsync("/api/auth/web/login",
            new LoginRequest(ApiFixture.AdminEmail, ApiFixture.AdminPassword));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains(login.Headers.GetValues("Set-Cookie"), cookie => cookie.Contains("Aqours.Session=") &&
            cookie.Contains("secure", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(csrfResponse.Headers.GetValues("Set-Cookie"), cookie => cookie.Contains("Aqours.Csrf=") &&
            cookie.Contains("secure", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Mobile_logout_revokes_only_its_refresh_family_and_bearer_cannot_use_web_routes()
    {
        using var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var customer = "logout-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(customer);
        var restricted = await LoginMobileAsync(client, customer, ApiFixture.AdminPassword);
        client.DefaultRequestHeaders.Authorization = new("Bearer", restricted.AccessToken);
        using var change = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        var session = (await change.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = null;
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        using var protectedResponse = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, protectedResponse.StatusCode);
        using var webLogout = await client.PostAsync("/api/auth/web/logout", null);
        Assert.Equal(HttpStatusCode.Unauthorized, webLogout.StatusCode);
        client.DefaultRequestHeaders.Authorization = null;

        using var logout = await client.PostAsJsonAsync("/api/auth/mobile/logout", new RefreshRequest(session.RefreshToken!));
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        using var refresh = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(session.RefreshToken!));
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        using var stillAuthenticated = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, stillAuthenticated.StatusCode);
        client.DefaultRequestHeaders.Authorization = null;

        var otherCustomer = "logout-other-" + Guid.NewGuid().ToString("N") + "@aqours.test";
        await CreateCustomerAsync(otherCustomer);
        var otherRestricted = await LoginMobileAsync(client, otherCustomer, ApiFixture.AdminPassword);
        client.DefaultRequestHeaders.Authorization = new("Bearer", otherRestricted.AccessToken);
        using var otherChange = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(ApiFixture.AdminPassword, ApiFixture.ChangedPassword), JsonOptions);
        Assert.Equal(HttpStatusCode.OK, otherChange.StatusCode);
        var otherSession = (await otherChange.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
        client.DefaultRequestHeaders.Authorization = null;
        using var otherRefresh = await client.PostAsJsonAsync("/api/auth/mobile/refresh", new RefreshRequest(otherSession.RefreshToken!));
        Assert.Equal(HttpStatusCode.OK, otherRefresh.StatusCode);
    }

    private static CreateAccountRequest NewAccount(string email, string role) =>
        new(email, "Integration", null, "User", ApiFixture.AdminPassword, role);

    private async Task CreateCustomerAsync(string email)
        => await CreateAccountAsync(email, AccountRoles.Customer);

    private async Task CreateAccountAsync(string email, string role)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<AccountService>();
        var outcome = await service.CreateAsync(new(email, "Integration", null, "Customer", ApiFixture.AdminPassword, role));
        Assert.True(outcome.Succeeded, string.Join("; ", outcome.Errors?.SelectMany(x => x.Value) ?? []));
    }

    private static async Task<MobileSessionResponse> LoginMobileAsync(HttpClient client, string email, string password)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/mobile/login", new LoginRequest(email, password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MobileSessionResponse>(JsonOptions))!;
    }

    private static string SignedToken(string id, string role, string stamp, string issuer, string audience, string signingKey) =>
        new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(issuer, audience,
            [new Claim("sub", id), new Claim("role", role), new Claim(AuthConfiguration.Restricted, "false"), new Claim(AuthConfiguration.Stamp, stamp)],
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), SecurityAlgorithms.HmacSha256)));

    private static AuthenticationTicket UnprotectTicket(IEnumerable<string> setCookies, ISecureDataFormat<AuthenticationTicket> format)
    {
        var cookie = setCookies.Single(value => value.StartsWith("Aqours.Session=", StringComparison.Ordinal));
        var protectedValue = Uri.UnescapeDataString(cookie.Split(';', 2)[0].Split('=', 2)[1]);
        return format.Unprotect(protectedValue)!;
    }

    private async Task<string> GetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/web/csrf");
        response.EnsureSuccessStatusCode();
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return body!.RootElement.GetProperty("requestToken").GetString()!;
    }

    private static async Task LoginWebAsync(HttpClient client, string email, string password, string csrf)
    {
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var response = await client.PostAsJsonAsync("/api/auth/web/login", new LoginRequest(email, password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static Task<HttpResponseMessage> PostJsonAsync(HttpClient client, string path, object body, string csrf)
    {
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        return client.PostAsJsonAsync(path, body);
    }

    private static Task<HttpResponseMessage> ChangePasswordAsync(HttpClient client, string path, string current, string next, string csrf) =>
        PostJsonAsync(client, path, new ChangePasswordRequest(current, next), csrf);
}
