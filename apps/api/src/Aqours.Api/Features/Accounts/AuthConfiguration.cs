using Aqours.Domain.Features.Accounts;
using System.Security.Claims;
using System.Text;
using Aqours.Application.Features.Accounts;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Aqours.Api.Features.Accounts;

public sealed class JwtSettings
{
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string SigningKey { get; set; } = "";
    public SymmetricSecurityKey Key => new(Encoding.UTF8.GetBytes(SigningKey));
}

public static class AuthConfiguration
{
    public const string Cookie = "Web", Bearer = "Bearer", Smart = "Session";
    public const string Restricted = "password_change", Stamp = "session_stamp";

    public static IServiceCollection AddAccountAuthentication(this IServiceCollection services, bool development)
    {
        services.AddSingleton(provider =>
        {
            var settings = provider.GetRequiredService<IConfiguration>().GetSection("Jwt").Get<JwtSettings>() ?? new();
            if (string.IsNullOrWhiteSpace(settings.Issuer) || string.IsNullOrWhiteSpace(settings.Audience) || Encoding.UTF8.GetByteCount(settings.SigningKey) < 32)
                throw new InvalidOperationException("Configure Jwt:Issuer, Jwt:Audience and Jwt:SigningKey (at least 32 UTF-8 bytes) using environment variables or user secrets. See docs/authentication.md.");
            return settings;
        });
        services.AddAuthentication(Smart)
            .AddPolicyScheme(Smart, Smart, options => options.ForwardDefaultSelector = context =>
                context.Request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? Bearer : Cookie)
            .AddCookie(Cookie, options =>
            {
                options.Cookie.Name = "Aqours.Session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.SlidingExpiration = false;
                options.Events = new CookieAuthenticationEvents
                {
                    OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; },
                    OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; },
                    OnValidatePrincipal = async context =>
                    {
                        if (!await ValidSessionAsync(context.Principal!, context.HttpContext.RequestServices, false))
                        {
                            context.RejectPrincipal();
                            await context.HttpContext.SignOutAsync(Cookie);
                        }
                    }
                };
            })
            .AddJwtBearer(Bearer);
        services.AddOptions<JwtBearerOptions>(Bearer).Configure<JwtSettings>((options, jwt) =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new()
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = jwt.Key,
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ClockSkew = TimeSpan.Zero,
                    NameClaimType = "sub",
                    RoleClaimType = "role"
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                {
                    if (!await ValidSessionAsync(context.Principal!, context.HttpContext.RequestServices, true))
                        context.Fail("Invalid Customer session.");
                }
                };
            });
        services.AddAuthorization(options =>
        {
            options.AddPolicy("Session", policy => policy.AddAuthenticationSchemes(Smart).RequireAuthenticatedUser());
            options.AddPolicy("WebSession", policy => policy.AddAuthenticationSchemes(Cookie).RequireAuthenticatedUser().RequireRole(AccountRoles.Admin, AccountRoles.Staff));
            options.AddPolicy("Admin", policy => policy.AddAuthenticationSchemes(Cookie).RequireAuthenticatedUser()
                .RequireRole(AccountRoles.Admin).RequireClaim(Restricted, "false"));
            options.AddPolicy("Customer", policy => policy.AddAuthenticationSchemes(Bearer).RequireAuthenticatedUser()
                .RequireRole(AccountRoles.Customer).RequireClaim(Restricted, "false"));
            // All future application endpoints must use a full-session policy.
            options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder(Smart)
                .RequireAuthenticatedUser().RequireClaim(Restricted, "false").Build();
        });
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = "Aqours.Csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        });
        return services;
    }

    private static async Task<bool> ValidSessionAsync(ClaimsPrincipal principal, IServiceProvider services, bool mobile)
    {
        var id = principal.FindFirstValue(mobile ? "sub" : ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(id)) return false;
        var session = await services.GetRequiredService<AccountService>().FindAsync(id);
        if (session is null || session.SecurityStamp != principal.FindFirstValue(Stamp) ||
            principal.FindFirstValue(Restricted) != (session.Account.RequiresPasswordChange ? "true" : "false")) return false;
        return mobile ? session.Account.Role == AccountRoles.Customer && principal.IsInRole(AccountRoles.Customer) :
            session.Account.Role is AccountRoles.Admin or AccountRoles.Staff && principal.IsInRole(session.Account.Role);
    }
}
