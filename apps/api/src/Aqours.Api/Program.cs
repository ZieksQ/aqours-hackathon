using Aqours.Api.Features.Weather;
using Aqours.Api.Features.Updates;
using Aqours.Api.Features.Accounts;
using Aqours.Api.Features.Map;
using Aqours.Api.Features.Reports;
using Aqours.Api.Features.SupplySites;
using Aqours.Application.Features.Accounts;
using Aqours.Infrastructure;
using Aqours.Application.Features.Reports;
using Microsoft.AspNetCore.SignalR;
using Aqours.Api.Hosting;

if (args is ["--healthcheck"])
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
    using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
    using var request = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/health");
    try
    {
        request.Headers.Host = Environment.GetEnvironmentVariable("API_HEALTH_HOST") is { Length: > 0 } host
            ? host
            : "localhost";
        using var response = await client.SendAsync(request, timeout.Token);
        return response.StatusCode == System.Net.HttpStatusCode.OK ? 0 : 1;
    }
    catch (Exception)
    {
        return 1;
    }
}

var builder = WebApplication.CreateBuilder(args);
ProductionHosting.Configure(builder);
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.ContentRootPath);
builder.Services.AddAccountAuthentication(builder.Environment.IsDevelopment());
builder.Services.AddSignalR();
builder.Services.AddSingleton<IUserIdProvider, ReportUserIdProvider>();
builder.Services.AddScoped<IReportNotifications, ReportNotifications>();
builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
var app = builder.Build();
_ = app.Services.GetRequiredService<JwtSettings>();
_ = app.Services.GetRequiredService<IChatAttachmentStorage>();

// Migrations are an explicit deployment step; startup only verifies schema and seeds accounts.
await using (var scope = app.Services.CreateAsyncScope())
{
    try { await scope.ServiceProvider.GetRequiredService<IAccountSeeder>().SeedAsync(); }
    catch (Exception ex) { throw new InvalidOperationException("Authentication startup failed. Check database availability, apply migrations, and configure SeedAdmin. See docs/authentication.md.", ex); }
}
ProductionHosting.UseTransportSecurity(app);
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode : StatusCodes.Status500InternalServerError
});
app.Use(async (http, next) =>
{
    if (http.Request.Path.StartsWithSegments("/api")) http.Response.Headers.CacheControl = "no-store";
    await next(http);
});
// CORS alone does not protect WebSocket upgrades. Check browser origins for every hub transport.
var allowedOrigins = builder.Configuration.GetSection("Realtime:AllowedOrigins").Get<string[]>() ?? [];
app.Use(async (http, next) =>
{
    if (http.Request.Path.StartsWithSegments("/api/hubs/reports") && http.Request.Headers.Origin is { Count: > 0 } origins)
    {
        var origin = origins.ToString();
        var sameOrigin = $"{http.Request.Scheme}://{http.Request.Host}";
        if (!string.Equals(origin, sameOrigin, StringComparison.OrdinalIgnoreCase) &&
            !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        {
            http.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next(http);
});
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health");
app.MapAccountEndpoints();
app.MapReportEndpoints();
app.MapStaffReportEndpoints();
app.MapSupplySiteEndpoints();
app.MapSupplyMonitoringEndpoints();
app.MapSupplierMapEndpoints();
app.MapWeatherEndpoints();
app.MapNotificationReadEndpoints();
app.MapHub<ReportsHub>("/api/hubs/reports", options => options.CloseOnAuthenticationExpiration = true);
app.Run();
return 0;

public partial class Program;
