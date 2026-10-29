using System.Security.Claims;
using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Api.Locations;
using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Features.SupplySites;

namespace Aqours.Api.Features.SupplySites;

// Bind the value without coercion so non-string statuses also receive field-keyed validation errors.
public sealed record RecordSupplyUpdateRequest(JsonElement Status)
{
    public string? StatusValue => Status.ValueKind == JsonValueKind.String ? Status.GetString() : null;
}

public sealed record SupplyUpdaterResponse(string Id, string Name);
public sealed record SupplyUpdateResponse(Guid Id, Guid SiteId, string Status, SupplyUpdaterResponse UpdatedBy, DateTimeOffset UpdatedAt)
{
    public static SupplyUpdateResponse From(SupplyUpdate update) => new(update.Id, update.SiteId, update.Status.ToString(),
        new(update.UpdatedById, update.UpdatedByName), update.UpdatedAt);
}

public sealed record MonitoredSupplySiteResponse(Guid Id, string Name, AddressResponse Address, double Latitude, double Longitude,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, SupplyUpdateResponse? LatestSupply)
{
    public static MonitoredSupplySiteResponse From(MonitoredSupplySite monitored)
    {
        var site = SupplySiteResponse.From(monitored.Site);
        return new(site.Id, site.Name, site.Address, site.Latitude, site.Longitude, site.CreatedAt, site.UpdatedAt,
            monitored.LatestSupply is { } update ? SupplyUpdateResponse.From(update) : null);
    }
}

public sealed record MonitoredSupplySitePageResponse(IReadOnlyList<MonitoredSupplySiteResponse> Items, int Page, int PageSize, int TotalCount);
public sealed record SupplyUpdatePageResponse(IReadOnlyList<SupplyUpdateResponse> Items, int Page, int PageSize, int TotalCount);

public static class SupplyMonitoringEndpoints
{
    public static void MapSupplyMonitoringEndpoints(this WebApplication app)
    {
        var sites = app.MapGroup("/api/staff/supply-sites").RequireAuthorization("Personnel");
        sites.MapGet("", async (SupplyMonitoringService service, CancellationToken cancellationToken, string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var pageNumber = SupplySiteEndpoints.ParsePagination(page, 1, "page", errors);
            var size = SupplySiteEndpoints.ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.ListAsync(pageNumber, size, cancellationToken);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            var value = result.Value!;
            return Results.Ok(new MonitoredSupplySitePageResponse(value.Items.Select(MonitoredSupplySiteResponse.From).ToList(),
                value.Page, value.PageSize, value.TotalCount));
        });
        sites.MapGet("/{id:guid}", async (Guid id, SupplyMonitoringService service, CancellationToken cancellationToken) =>
        {
            var site = await service.FindAsync(id, cancellationToken);
            return site is null ? Results.NotFound() : Results.Ok(MonitoredSupplySiteResponse.From(site));
        });
        sites.MapGet("/{id:guid}/supply-updates", async (Guid id, SupplyMonitoringService service, CancellationToken cancellationToken,
            string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var pageNumber = SupplySiteEndpoints.ParsePagination(page, 1, "page", errors);
            var size = SupplySiteEndpoints.ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.HistoryAsync(id, pageNumber, size, cancellationToken);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            if (result.Value is not { } value) return Results.NotFound();
            return Results.Ok(new SupplyUpdatePageResponse(value.Items.Select(SupplyUpdateResponse.From).ToList(),
                value.Page, value.PageSize, value.TotalCount));
        });
        sites.MapPost("/{id:guid}/supply-updates", async (Guid id, RecordSupplyUpdateRequest request, ClaimsPrincipal user,
            SupplyMonitoringService service, CancellationToken cancellationToken) =>
        {
            var result = await service.RecordAsync(id, user.FindFirstValue(ClaimTypes.NameIdentifier)!, request.StatusValue, cancellationToken);
            if (result.Unauthorized) return Results.Forbid();
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            return result.Value is { } update
                ? Results.Created($"/api/staff/supply-sites/{id}/supply-updates", SupplyUpdateResponse.From(update))
                : Results.NotFound();
        }).RequireAuthorization(policy => policy.RequireRole(AccountRoles.Staff)).AddEndpointFilter<CsrfFilter>();
    }
}
