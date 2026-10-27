using Aqours.Domain.Features.Accounts;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Aqours.Application.Features.Accounts;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.IdentityModel.Tokens;

namespace Aqours.Api.Features.Accounts;

public sealed record AccountInfo(string Id, string Email, string FirstName, string? MiddleName,
    string LastName, string Role, bool RequiresPasswordChange)
{
    public static AccountInfo From(Account account) => new(account.Id, account.Email, account.FirstName,
        account.MiddleName, account.LastName, account.Role, account.RequiresPasswordChange);
}

public sealed record LoginRequest(string Email, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record CreateAccountRequest(string Email, string FirstName, string? MiddleName, string LastName, string InitialPassword, string Role);
public sealed record RefreshRequest(string RefreshToken);
public sealed record MobileSessionResponse(AccountInfo Account, string AccessToken, DateTimeOffset AccessTokenExpiresAt,
    string? RefreshToken, DateTimeOffset? RefreshTokenExpiresAt);

public static class AccountEndpoints
{
    public static void MapAccountEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth");
        auth.MapGet("/web/csrf", (HttpContext http, IAntiforgery antiforgery) =>
            Results.Ok(new { requestToken = antiforgery.GetAndStoreTokens(http).RequestToken }));

        auth.MapPost("/web/login", async (LoginRequest request, AccountService accounts, HttpContext http) =>
        {
            var result = await accounts.LoginAsync(request.Email, request.Password, false);
            if (!result.Succeeded) return Failure(result);
            await WebSessionAsync(http, result.Value!);
            return Results.Ok(AccountInfo.From(result.Value!.Account));
        }).AddEndpointFilter<CsrfFilter>();

        auth.MapPost("/web/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(AuthConfiguration.Cookie);
            return Results.NoContent();
        }).RequireAuthorization("WebSession").AddEndpointFilter<CsrfFilter>();

        auth.MapPost("/mobile/login", async (LoginRequest request, AccountService accounts, IRefreshSessions refresh, JwtSettings jwt, TimeProvider clock) =>
        {
            var result = await accounts.LoginAsync(request.Email, request.Password, true);
            if (!result.Succeeded) return Failure(result);
            return Results.Ok(await MobileSessionAsync(result.Value!, refresh, jwt, clock));
        });

        auth.MapPost("/mobile/refresh", async (RefreshRequest request, IRefreshSessions refresh, JwtSettings jwt, TimeProvider clock) =>
        {
            var session = await refresh.RotateAsync(request.RefreshToken);
            return session is null ? Results.Unauthorized() : Results.Ok(TokenResponse(session.Session, session, jwt, clock));
        });

        // Possession of a refresh token authorizes revocation of only its own family.
        auth.MapPost("/mobile/logout", async (RefreshRequest request, IRefreshSessions refresh) =>
        {
            await refresh.RevokeAsync(request.RefreshToken);
            return Results.NoContent();
        });

        auth.MapGet("/me", async (HttpContext http, AccountService accounts) =>
        {
            var session = await accounts.FindAsync(UserId(http));
            return session is null ? Results.Unauthorized() : Results.Ok(AccountInfo.From(session.Account));
        }).RequireAuthorization("Session");

        auth.MapPost("/change-password", async (ChangePasswordRequest request, AccountService accounts, HttpContext http,
            IRefreshSessions refresh, JwtSettings jwt, TimeProvider clock) =>
        {
            var result = await accounts.ChangePasswordAsync(UserId(http), request.CurrentPassword, request.NewPassword);
            if (!result.Succeeded) return Failure(result);
            if (IsMobile(http)) return Results.Ok(await MobileSessionAsync(result.Value!, refresh, jwt, clock));
            await WebSessionAsync(http, result.Value!);
            return Results.Ok(AccountInfo.From(result.Value!.Account));
        }).RequireAuthorization("Session").AddEndpointFilter<CsrfFilter>();

        app.MapGet("/api/accounts", async (AccountService accounts, CancellationToken ct) =>
            Results.Ok((await accounts.ListAsync(ct)).Select(AccountInfo.From)))
            .RequireAuthorization("Admin");

        app.MapPost("/api/accounts", async (CreateAccountRequest request, AccountService accounts) =>
        {
            var result = await accounts.CreateAsync(new(request.Email, request.FirstName, request.MiddleName,
                request.LastName, request.InitialPassword, request.Role));
            return result.Succeeded ? Results.Created($"/api/accounts/{result.Value!.Account.Id}", AccountInfo.From(result.Value.Account)) : Failure(result);
        }).RequireAuthorization("Admin").AddEndpointFilter<CsrfFilter>();
    }

    internal static bool IsMobile(HttpContext http) => http.User.Identity?.AuthenticationType == "AuthenticationTypes.Federation" ||
        http.Request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);
    private static string UserId(HttpContext http) => http.User.FindFirstValue(IsMobile(http) ? "sub" : ClaimTypes.NameIdentifier)!;
    private static IResult Failure<T>(Outcome<T> result) => result.Unauthorized ? Results.Unauthorized() :
        Results.ValidationProblem(result.Errors ?? new() { ["request"] = ["The request could not be completed."] });

    private static async Task WebSessionAsync(HttpContext http, AccountSession session)
    {
        var claims = Claims(session, false);
        await http.SignInAsync(AuthConfiguration.Cookie, new ClaimsPrincipal(new ClaimsIdentity(claims, AuthConfiguration.Cookie)),
            new AuthenticationProperties
            {
                IsPersistent = false,
                AllowRefresh = false,
                ExpiresUtc = DateTimeOffset.UtcNow.Add(session.Account.RequiresPasswordChange ? TimeSpan.FromMinutes(10) : TimeSpan.FromHours(8))
            });
    }
    private static IEnumerable<Claim> Claims(AccountSession session, bool mobile) =>
    [
        new(mobile ? "sub" : ClaimTypes.NameIdentifier, session.Account.Id),
        new(mobile ? "role" : ClaimTypes.Role, session.Account.Role),
        new(AuthConfiguration.Restricted, session.Account.RequiresPasswordChange ? "true" : "false"),
        new(AuthConfiguration.Stamp, session.SecurityStamp)
    ];

    private static async Task<MobileSessionResponse> MobileSessionAsync(AccountSession session, IRefreshSessions refresh, JwtSettings jwt, TimeProvider clock)
    {
        var family = session.Account.RequiresPasswordChange ? null : await refresh.CreateAsync(session);
        return TokenResponse(session, family, jwt, clock);
    }
    private static MobileSessionResponse TokenResponse(AccountSession session, RefreshSession? refresh, JwtSettings jwt, TimeProvider clock)
    {
        var now = clock.GetUtcNow();
        var expiry = now.AddMinutes(session.Account.RequiresPasswordChange ? 10 : 15);
        var token = new JwtSecurityToken(jwt.Issuer, jwt.Audience,
            Claims(session, true).Append(new("jti", Guid.NewGuid().ToString())), now.UtcDateTime, expiry.UtcDateTime,
            new SigningCredentials(jwt.Key, SecurityAlgorithms.HmacSha256));
        return new(AccountInfo.From(session.Account), new JwtSecurityTokenHandler().WriteToken(token), expiry, refresh?.Token, refresh?.ExpiresAt);
    }
}

public sealed class CsrfFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        // Only the shared password endpoint can use either scheme; mobile tokens never authorize web writes.
        if (context.HttpContext.Request.Path == "/api/auth/change-password" && AccountEndpoints.IsMobile(context.HttpContext))
            return await next(context);
        try { await antiforgery.ValidateRequestAsync(context.HttpContext); }
        catch (AntiforgeryValidationException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["csrf"] = ["Refresh the page and try again."] }); }
        return await next(context);
    }
}
