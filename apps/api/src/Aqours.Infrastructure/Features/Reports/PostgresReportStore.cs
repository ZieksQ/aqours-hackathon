using Aqours.Application.Features.Reports;
using Aqours.Domain.Features.Reports;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Reports;

public sealed class PostgresReportStore(AqoursDbContext db) : IReportStore
{
    public async Task AddAsync(Report report, CancellationToken cancellationToken)
    {
        db.Reports.Add(report);
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task<Report?> FindAsync(string customerId, Guid id, CancellationToken cancellationToken) =>
        db.Reports.AsNoTracking().SingleOrDefaultAsync(r => r.CustomerId == customerId && r.Id == id, cancellationToken);

    public async Task<ReportPage> ListAsync(string customerId, int page, int pageSize, CancellationToken cancellationToken)
    {
        var query = db.Reports.AsNoTracking().Where(r => r.CustomerId == customerId);
        var count = await query.CountAsync(cancellationToken);
        var offset = ((long)page - 1) * pageSize;
        // Out-of-range pages are empty; avoid overflowing EF's integer Skip parameter.
        var items = offset >= count ? [] : await query.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
            .Skip((int)offset).Take(pageSize).ToListAsync(cancellationToken);
        return new(items, page, pageSize, count);
    }
}
