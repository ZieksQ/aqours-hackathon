using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Reports;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Locations;

namespace Aqours.Application.Features.Map;

public sealed record MapPage<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);
public sealed record MapSite(Guid Id, string Name, PsgcAddress Address, double Latitude, double Longitude,
    SupplyStatus? LatestSupplyStatus, DateTimeOffset? LatestSupplyAt);
public sealed record MapReport(Guid Id, IssueType IssueType, PsgcAddress Address, double Latitude, double Longitude,
    ReportPriority Priority, ReportStatus Status, DateTimeOffset CreatedAt, string? HandlerId, string? HandlerName);

public interface ISupplierMapStore
{
    Task<MapPage<MapSite>> SitesAsync(int page, int pageSize, CancellationToken ct);
    Task<MapPage<MapReport>> ReportsAsync(string status, int page, int pageSize, CancellationToken ct);
}

public sealed class SupplierMapService(ISupplierMapStore store)
{
    public async Task<Outcome<MapPage<MapSite>>> SitesAsync(int page, int pageSize, CancellationToken ct = default)
    {
        var errors = ValidatePagination(page, pageSize);
        return errors.Count > 0 ? new(null, errors) : new(await store.SitesAsync(page, pageSize, ct));
    }

    public async Task<Outcome<MapPage<MapReport>>> ReportsAsync(string status, int page, int pageSize, CancellationToken ct = default)
    {
        var errors = ValidatePagination(page, pageSize);
        if (status is not ("unresolved" or "all" or "Submitted" or "InProgress" or "Resolved"))
            errors["status"] = ["Choose unresolved, all, Submitted, InProgress, or Resolved."];
        return errors.Count > 0 ? new(null, errors) : new(await store.ReportsAsync(status, page, pageSize, ct));
    }

    private static Dictionary<string, string[]> ValidatePagination(int page, int pageSize)
    {
        var errors = new Dictionary<string, string[]>();
        if (page < 1) errors["page"] = ["Page must be positive."];
        if (pageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        return errors;
    }
}
