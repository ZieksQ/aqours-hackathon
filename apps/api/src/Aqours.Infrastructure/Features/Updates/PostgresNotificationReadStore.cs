using Aqours.Application.Features.Updates;
using Aqours.Domain.Features.Updates;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Updates;

public sealed class PostgresNotificationReadStore(AqoursDbContext db) : INotificationReadStore
{
    public async Task<IReadOnlyList<string>> ListAsync(string customerId, CancellationToken cancellationToken) =>
        await db.NotificationReads.AsNoTracking().Where(read => read.CustomerId == customerId)
            .OrderBy(read => read.EventId).Select(read => read.EventId).ToListAsync(cancellationToken);

    public async Task MarkAsync(string customerId, IReadOnlyList<string> eventIds, DateTimeOffset readAt, CancellationToken cancellationToken)
    {
        var existing = await db.NotificationReads.Where(read => read.CustomerId == customerId && eventIds.Contains(read.EventId))
            .Select(read => read.EventId).ToListAsync(cancellationToken);
        var known = existing.ToHashSet(StringComparer.Ordinal);
        db.NotificationReads.AddRange(eventIds.Where(id => !known.Contains(id)).Select(id => new NotificationRead(customerId, id, readAt)));
        await db.SaveChangesAsync(cancellationToken);
    }
}
