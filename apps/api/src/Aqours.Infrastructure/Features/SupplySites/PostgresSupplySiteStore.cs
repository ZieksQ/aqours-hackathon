using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.SupplySites;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.SupplySites;

public sealed class PostgresSupplySiteStore(AqoursDbContext db) : ISupplySiteStore
{
    public async Task AddAsync(SupplySite site, CancellationToken cancellationToken)
    {
        db.SupplySites.Add(site);
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task<SupplySite?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        db.SupplySites.SingleOrDefaultAsync(site => site.Id == id, cancellationToken);

    public async Task UpdateAsync(SupplySite site, CancellationToken cancellationToken)
    {
        // PUT replaces every editable field, including values unchanged since this request read the site.
        // This keeps concurrent replacements last-successful-write-wins rather than merging fields.
        var entry = db.Entry(site);
        entry.Property(s => s.Name).IsModified = true;
        entry.Property(s => s.Address).IsModified = true;
        entry.Property(s => s.Latitude).IsModified = true;
        entry.Property(s => s.Longitude).IsModified = true;
        entry.Property(s => s.UpdatedAt).IsModified = true;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<SupplySitePage> ListAsync(int page, int pageSize, CancellationToken cancellationToken)
    {
        var query = db.SupplySites.AsNoTracking();
        var count = await query.CountAsync(cancellationToken);
        var offset = ((long)page - 1) * pageSize;
        var items = offset >= count ? [] : await query.OrderBy(site => site.Name).ThenBy(site => site.Id)
            .Skip((int)offset).Take(pageSize).ToListAsync(cancellationToken);
        return new(items, page, pageSize, count);
    }
}
