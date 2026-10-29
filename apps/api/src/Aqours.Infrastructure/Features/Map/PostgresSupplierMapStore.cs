using Aqours.Application.Features.Map;
using Aqours.Domain.Features.Reports;
using Aqours.Domain.Features.SupplySites;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Map;

public sealed class PostgresSupplierMapStore(AqoursDbContext db) : ISupplierMapStore
{
    public async Task<MapPage<MapSite>> SitesAsync(int page, int pageSize, CancellationToken ct)
    {
        var query = db.SupplySites.AsNoTracking();
        var count = await query.CountAsync(ct);
        var offset = ((long)page - 1) * pageSize;
        var items = offset >= count ? [] : await query.OrderBy(site => site.Name).ThenBy(site => site.Id)
            .Skip((int)offset).Take(pageSize)
            .Select(site => new MapSite(site.Id, site.Name, site.Address, site.Latitude, site.Longitude,
                db.SupplyUpdates.Where(update => update.SiteId == site.Id).OrderByDescending(update => update.Sequence)
                    .Select(update => (SupplyStatus?)update.Status).FirstOrDefault(),
                db.SupplyUpdates.Where(update => update.SiteId == site.Id).OrderByDescending(update => update.Sequence)
                    .Select(update => (DateTimeOffset?)update.UpdatedAt).FirstOrDefault()))
            .ToListAsync(ct);
        return new(items, page, pageSize, count);
    }

    public async Task<MapPage<MapReport>> ReportsAsync(string status, int page, int pageSize, CancellationToken ct)
    {
        var query = db.Reports.AsNoTracking();
        if (status == "unresolved") query = query.Where(report => report.Status != ReportStatus.Resolved);
        else if (status != "all")
        {
            var selected = Enum.Parse<ReportStatus>(status);
            query = query.Where(report => report.Status == selected);
        }
        var count = await query.CountAsync(ct);
        var offset = ((long)page - 1) * pageSize;
        if (offset >= count) return new([], page, pageSize, count);
        var reports = query.OrderByDescending(report => report.CreatedAt).ThenByDescending(report => report.Id)
            .Skip((int)offset).Take(pageSize);
        var items = await (from report in reports
                           join handler in db.Users on report.AssignedStaffId equals handler.Id into handlers
                           from handler in handlers.DefaultIfEmpty()
                           orderby report.CreatedAt descending, report.Id descending
                           select new MapReport(report.Id, report.IssueType, report.Address, report.Latitude, report.Longitude,
                               report.Priority, report.Status, report.CreatedAt, report.AssignedStaffId,
                               handler == null ? null : handler.FirstName + " " + handler.LastName)).ToListAsync(ct);
        return new(items, page, pageSize, count);
    }
}
