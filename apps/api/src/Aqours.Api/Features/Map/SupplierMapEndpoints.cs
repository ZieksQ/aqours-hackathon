using Aqours.Api.Features.SupplySites;
using Aqours.Api.Locations;
using Aqours.Application.Features.Map;
using Aqours.Domain.Locations;

namespace Aqours.Api.Features.Map;

public sealed record MapSiteResponse(Guid Id, string Name, AddressResponse Address, double Latitude, double Longitude,
    string? LatestSupplyStatus, DateTimeOffset? LatestSupplyAt);
public sealed record MapReportResponse(Guid Id, string IssueType, AddressResponse Address, double Latitude, double Longitude,
    string Priority, string Status, DateTimeOffset CreatedAt, string? HandlerId, string? HandlerName);
public sealed record MapPageResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public static class SupplierMapEndpoints
{
    public static void MapSupplierMapEndpoints(this WebApplication app)
    {
        var map = app.MapGroup("/api/staff/map").RequireAuthorization("Personnel");
        map.MapGet("/sites", async (SupplierMapService service, CancellationToken ct, string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var number = SupplySiteEndpoints.ParsePagination(page, 1, "page", errors);
            var size = SupplySiteEndpoints.ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.SitesAsync(number, size, ct);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            var value = result.Value!;
            return Results.Ok(new MapPageResponse<MapSiteResponse>(value.Items.Select(site => new MapSiteResponse(
                site.Id, site.Name, Address(site.Address), site.Latitude, site.Longitude,
                site.LatestSupplyStatus?.ToString(), site.LatestSupplyAt)).ToList(), value.Page, value.PageSize, value.TotalCount));
        });
        map.MapGet("/reports", async (SupplierMapService service, CancellationToken ct,
            string status = "unresolved", string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var number = SupplySiteEndpoints.ParsePagination(page, 1, "page", errors);
            var size = SupplySiteEndpoints.ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.ReportsAsync(status, number, size, ct);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            var value = result.Value!;
            return Results.Ok(new MapPageResponse<MapReportResponse>(value.Items.Select(report => new MapReportResponse(
                report.Id, report.IssueType.ToString(), Address(report.Address), report.Latitude, report.Longitude,
                report.Priority.ToString(), report.Status.ToString(), report.CreatedAt, report.HandlerId, report.HandlerName))
                .ToList(), value.Page, value.PageSize, value.TotalCount));
        });
    }

    private static AddressResponse Address(PsgcAddress address) => new(address.RegionCode, address.RegionName,
        address.ProvinceCode, address.ProvinceName, address.CityMunicipalityCode, address.CityMunicipalityName,
        address.SubMunicipalityCode, address.SubMunicipalityName, address.BarangayCode, address.BarangayName, address.Details);
}
