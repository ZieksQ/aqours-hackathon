using Aqours.Api.Locations;
using System.Security.Claims;
using System.Globalization;
using Aqours.Application.Features.Reports;
using Aqours.Domain.Features.Reports;

namespace Aqours.Api.Features.Reports;

public sealed record SubmitReportRequest(string? IssueType, string? Description, AddressRequest? Address, double? Latitude, double? Longitude);
public sealed record ReportResponse(Guid Id, string IssueType, string Description, AddressResponse Address,
    double Latitude, double Longitude, string Status, DateTimeOffset CreatedAt)
{
    public static ReportResponse From(Report report)
    {
        var a = report.Address;
        return new(report.Id, report.IssueType.ToString(), report.Description,
            new(a.RegionCode, a.RegionName, a.ProvinceCode, a.ProvinceName, a.CityMunicipalityCode, a.CityMunicipalityName,
                a.SubMunicipalityCode, a.SubMunicipalityName, a.BarangayCode, a.BarangayName, a.Details),
            report.Latitude, report.Longitude, report.Status.ToString(), report.CreatedAt);
    }
}
public sealed record ReportPageResponse(IReadOnlyList<ReportResponse> Items, int Page, int PageSize, int TotalCount);

public static class ReportEndpoints
{
    public static void MapReportEndpoints(this WebApplication app)
    {
        var reports = app.MapGroup("/api/reports").RequireAuthorization("Customer");
        reports.MapPost("", async (SubmitReportRequest request, ClaimsPrincipal user, ReportService service, CancellationToken cancellationToken) =>
        {
            var a = request.Address;
            var result = await service.SubmitAsync(user.FindFirstValue("sub")!, new(request.IssueType, request.Description,
                a is null ? null : new(a.RegionCode, a.ProvinceCode, a.CityMunicipalityCode, a.SubMunicipalityCode, a.BarangayCode, a.Details),
                request.Latitude, request.Longitude), cancellationToken);
            return result.Succeeded ? Results.Created($"/api/reports/{result.Value!.Id}", ReportResponse.From(result.Value)) :
                Results.ValidationProblem(result.Errors!);
        });
        reports.MapGet("", async (ClaimsPrincipal user, ReportService service, CancellationToken cancellationToken, string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var pageNumber = ParsePagination(page, 1, "page", errors);
            var size = ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.ListAsync(user.FindFirstValue("sub")!, pageNumber, size, cancellationToken);
            if (!result.Succeeded) return Results.ValidationProblem(result.Errors!);
            var value = result.Value!;
            return Results.Ok(new ReportPageResponse(value.Items.Select(ReportResponse.From).ToList(), value.Page, value.PageSize, value.TotalCount));
        });
        reports.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, ReportService service, CancellationToken cancellationToken) =>
        {
            var report = await service.FindAsync(user.FindFirstValue("sub")!, id, cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(ReportResponse.From(report));
        });
    }

    private static int ParsePagination(string? value, int fallback, string field, Dictionary<string, string[]> errors)
    {
        if (value is null) return fallback;
        if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)) return number;
        errors[field] = ["Enter a valid integer."];
        return fallback;
    }
}
