using Aqours.Api.Features.Accounts;
using Aqours.Api.Features.Reports;
using Aqours.Application.Features.Accounts;
using Aqours.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddAccountAuthentication(builder.Environment.IsDevelopment());
builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
var app = builder.Build();
_ = app.Services.GetRequiredService<JwtSettings>();

// Migrations are an explicit deployment step; startup only verifies schema and seeds accounts.
await using (var scope = app.Services.CreateAsyncScope())
{
    try { await scope.ServiceProvider.GetRequiredService<IAccountSeeder>().SeedAsync(); }
    catch (Exception ex) { throw new InvalidOperationException("Authentication startup failed. Check database availability, apply migrations, and configure SeedAdmin. See docs/authentication.md.", ex); }
}
if (!app.Environment.IsDevelopment()) app.UseHttpsRedirection();
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
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health");
app.MapAccountEndpoints();
app.MapReportEndpoints();
app.Run();

public partial class Program;
