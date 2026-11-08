using Aqours.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.TestHost;

namespace Aqours.Api.Tests;

public sealed class ProductionHostingTests
{
    [Theory]
    [InlineData("portal.aqours.example", true)]
    [InlineData("127.0.0.1", true)]
    [InlineData("https://portal.aqours.example", false)]
    [InlineData("portal.aqours.example:443", false)]
    [InlineData("portal.aqours.example/path", false)]
    [InlineData("*.aqours.example", false)]
    [InlineData("portal..aqours.example", false)]
    public void Public_host_requires_an_exact_host_without_url_components(string host, bool valid)
    {
        if (valid)
        {
            Assert.Equal(host, ProductionHosting.ValidatePublicHost(host));
            return;
        }

        Assert.Throws<InvalidOperationException>(() => ProductionHosting.ValidatePublicHost(host));
    }

    [Fact]
    public void Forwarded_headers_trust_only_the_configured_docker_network()
    {
        var builder = CreateProductionBuilder();
        ProductionHosting.Configure(builder);

        using var provider = builder.Services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

        Assert.Equal(ForwardedHeaders.XForwardedHost | ForwardedHeaders.XForwardedProto, options.ForwardedHeaders);
        Assert.Equal(1, options.ForwardLimit);
        Assert.True(options.RequireHeaderSymmetry);
        Assert.Empty(options.KnownProxies);
        Assert.Single(options.KnownIPNetworks);
        Assert.Contains(System.Net.IPNetwork.Parse("172.30.0.0/24"), options.KnownIPNetworks);
        Assert.Equal("portal.aqours.example", Assert.Single(options.AllowedHosts));
    }

    [Fact]
    public async Task Health_is_http_for_the_health_probe_and_other_production_routes_require_https()
    {
        var builder = CreateProductionBuilder();
        builder.WebHost.UseTestServer();
        ProductionHosting.Configure(builder);

        await using var app = builder.Build();
        app.Use(async (context, next) =>
        {
            context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(
                context.Request.Headers.ContainsKey("X-Test-Trusted-Remote") ? "172.30.0.12" : "203.0.113.10");
            await next();
        });
        ProductionHosting.UseTransportSecurity(app);
        app.MapGet("/health", () => Results.Ok());
        app.MapGet("/api/ping", () => Results.Ok());
        await app.StartAsync();

        var client = app.GetTestClient();
        using var health = new HttpRequestMessage(HttpMethod.Get, "/health");
        health.Headers.Host = "portal.aqours.example";
        using var healthResponse = await client.SendAsync(health);
        Assert.Equal(System.Net.HttpStatusCode.OK, healthResponse.StatusCode);

        using var api = new HttpRequestMessage(HttpMethod.Get, "/api/ping");
        api.Headers.Host = "portal.aqours.example";
        api.Headers.TryAddWithoutValidation("X-Forwarded-Host", "portal.aqours.example");
        api.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
        using var apiResponse = await client.SendAsync(api);
        Assert.Equal(System.Net.HttpStatusCode.TemporaryRedirect, apiResponse.StatusCode);
        Assert.Equal("https://portal.aqours.example/api/ping", apiResponse.Headers.Location?.ToString());

        using var trustedApi = new HttpRequestMessage(HttpMethod.Get, "/api/ping");
        trustedApi.Headers.Host = "portal.aqours.example";
        trustedApi.Headers.Add("X-Test-Trusted-Remote", "true");
        trustedApi.Headers.TryAddWithoutValidation("X-Forwarded-Host", "portal.aqours.example");
        trustedApi.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
        using var trustedApiResponse = await client.SendAsync(trustedApi);
        Assert.Equal(System.Net.HttpStatusCode.OK, trustedApiResponse.StatusCode);

        using var rejectedHost = new HttpRequestMessage(HttpMethod.Get, "/health");
        rejectedHost.Headers.Host = "attacker.example";
        using var rejectedResponse = await client.SendAsync(rejectedHost);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, rejectedResponse.StatusCode);

        await app.StopAsync();
    }

    [Theory]
    [InlineData("172.30.0.0/24", true)]
    [InlineData("10.40.0.0/16", true)]
    [InlineData("127.0.0.0/8", false)]
    [InlineData("0.0.0.0/0", false)]
    [InlineData("2001:db8::/64", false)]
    [InlineData("not-a-cidr", false)]
    public void Trusted_proxy_network_must_be_a_bounded_ipv4_cidr(string cidr, bool valid)
    {
        if (valid)
        {
            Assert.Equal(System.Net.IPNetwork.Parse(cidr), ProductionHosting.ParseTrustedProxyNetwork(cidr));
            return;
        }

        Assert.Throws<InvalidOperationException>(() => ProductionHosting.ParseTrustedProxyNetwork(cidr));
    }

    private static WebApplicationBuilder CreateProductionBuilder()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PROD_PUBLIC_HOST"] = "portal.aqours.example",
            ["PROD_PROXY_CIDR"] = "172.30.0.0/24",
            ["AQOURS_DATA_PROTECTION_KEY_PATH"] = Path.Combine(Path.GetTempPath(), "aqours-production-hosting-tests"),
            ["ConnectionStrings:Aqours"] = "Host=database.example;Database=aqours;Username=api;Password=test-only",
            ["Jwt:Issuer"] = "aqours-production-tests",
            ["Jwt:Audience"] = "aqours-production-tests",
            ["Jwt:SigningKey"] = "test-only-signing-key-32-bytes-long",
            ["SeedAdmin:Email"] = "admin@aqours.example"
        });
        return builder;
    }
}
