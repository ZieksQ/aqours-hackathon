using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.HttpOverrides;
using TrustedProxyNetwork = System.Net.IPNetwork;

namespace Aqours.Api.Hosting;

public static partial class ProductionHosting
{
    private const string PublicHostVariable = "PROD_PUBLIC_HOST";
    private const string ProxyCidrVariable = "PROD_PROXY_CIDR";
    private const string DataProtectionPathVariable = "AQOURS_DATA_PROTECTION_KEY_PATH";

    public static void Configure(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsProduction()) return;

        var publicHost = ValidatePublicHost(builder.Configuration[PublicHostVariable]);
        var trustedProxyNetwork = ParseTrustedProxyNetwork(builder.Configuration[ProxyCidrVariable]);
        var dataProtectionPath = ValidateDataProtectionPath(builder.Configuration[DataProtectionPathVariable]);
        RequireValue(builder.Configuration.GetConnectionString("Aqours"), "ConnectionStrings__Aqours");
        var jwt = builder.Configuration.GetSection("Jwt");
        RequireValue(jwt["Issuer"], "Jwt__Issuer");
        RequireValue(jwt["Audience"], "Jwt__Audience");
        var signingKey = RequireValue(jwt["SigningKey"], "Jwt__SigningKey");
        if (Encoding.UTF8.GetByteCount(signingKey) < 32)
        {
            throw new InvalidOperationException("PROD_JWT_SIGNING_KEY must contain at least 32 UTF-8 bytes.");
        }

        RequireValue(builder.Configuration["SeedAdmin:Email"], "SeedAdmin__Email");

        builder.Configuration["AllowedHosts"] = publicHost;
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedHost | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.RequireHeaderSymmetry = true;
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
            options.KnownIPNetworks.Add(trustedProxyNetwork);
            options.AllowedHosts.Clear();
            options.AllowedHosts.Add(publicHost);
        });
        builder.Services.AddHttpsRedirection(options => options.HttpsPort = 443);

        builder.Services.AddDataProtection()
            .SetApplicationName("Aqours")
            .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionPath));
    }

    public static void UseTransportSecurity(WebApplication app)
    {
        if (app.Environment.IsProduction())
        {
            app.UseForwardedHeaders();
            app.UseWhen(context => ShouldRedirectToHttps(context.Request.Path.Value), branch =>
                branch.UseHttpsRedirection());
        }
        else if (!app.Environment.IsDevelopment())
        {
            app.UseHttpsRedirection();
        }
    }

    public static bool ShouldRedirectToHttps(string? path) =>
        !string.Equals(path, "/health", StringComparison.Ordinal);

    public static string ValidatePublicHost(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 253 || !IsHostName().IsMatch(value) ||
            Uri.CheckHostName(value) is UriHostNameType.Unknown or UriHostNameType.IPv6)
        {
            throw new InvalidOperationException(
                "PROD_PUBLIC_HOST must be a hostname or IPv4 address without a URL scheme, port, path, or wildcard.");
        }

        return value;
    }

    public static TrustedProxyNetwork ParseTrustedProxyNetwork(string? value)
    {
        if (!TrustedProxyNetwork.TryParse(value, out var network) ||
            network.PrefixLength is < 16 or > 30 ||
            network.BaseAddress.AddressFamily != AddressFamily.InterNetwork)
        {
            throw new InvalidOperationException(
                "PROD_PROXY_CIDR must be a trusted IPv4 Docker subnet with a prefix from /16 through /30.");
        }

        return network;
    }

    public static string ValidateDataProtectionPath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !Path.IsPathFullyQualified(value))
        {
            throw new InvalidOperationException(
                "AQOURS_DATA_PROTECTION_KEY_PATH must be an absolute writable directory.");
        }

        return value;
    }

    private static string RequireValue(string? value, string settingName) =>
        !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new InvalidOperationException($"{settingName} is required in Production.");

    [GeneratedRegex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$", RegexOptions.CultureInvariant)]
    private static partial Regex IsHostName();
}
