using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.SupplySites;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.SupplySites;

public sealed class PostgresSupplyMonitoringStore(AqoursDbContext db) : ISupplyMonitoringStore
{
    private IQueryable<MonitoredSupplySite> WithLatest(IQueryable<SupplySite> sites) =>
        sites.Select(site => new MonitoredSupplySite(site, db.SupplyUpdates.AsNoTracking()
            .Where(update => update.SiteId == site.Id).OrderByDescending(update => update.Sequence).FirstOrDefault()));

    public Task<bool> SiteExistsAsync(Guid id, CancellationToken cancellationToken) =>
        db.SupplySites.AnyAsync(site => site.Id == id, cancellationToken);

    public Task<MonitoredSupplySite?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        WithLatest(db.SupplySites.AsNoTracking().Where(site => site.Id == id)).SingleOrDefaultAsync(cancellationToken);

    public async Task<MonitoredSupplySitePage> ListAsync(int page, int pageSize, CancellationToken cancellationToken)
    {
        var query = db.SupplySites.AsNoTracking();
        var count = await query.CountAsync(cancellationToken);
        var offset = ((long)page - 1) * pageSize;
        var items = offset >= count ? [] : await WithLatest(query.OrderBy(site => site.Name).ThenBy(site => site.Id)
            .Skip((int)offset).Take(pageSize)).ToListAsync(cancellationToken);
        return new(items, page, pageSize, count);
    }

    public async Task AddAsync(SupplyUpdate update, CancellationToken cancellationToken)
    {
        db.SupplyUpdates.Add(update);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<SupplyUpdatePage> HistoryAsync(Guid siteId, int page, int pageSize, CancellationToken cancellationToken)
    {
        var query = db.SupplyUpdates.AsNoTracking().Where(update => update.SiteId == siteId);
        var count = await query.CountAsync(cancellationToken);
        var offset = ((long)page - 1) * pageSize;
        var items = offset >= count ? [] : await query.OrderByDescending(update => update.Sequence)
            .Skip((int)offset).Take(pageSize).ToListAsync(cancellationToken);
        return new(items, page, pageSize, count);
    }
}
