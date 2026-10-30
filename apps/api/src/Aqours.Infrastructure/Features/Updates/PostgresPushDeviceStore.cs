using Aqours.Application.Features.Updates;
using Aqours.Domain.Features.Updates;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Updates;

public sealed class PostgresPushDeviceStore(AqoursDbContext db) : IPushDeviceStore
{
    public async Task RegisterAsync(string customerId, string token, DateTimeOffset registeredAt, CancellationToken cancellationToken)
    {
        var current = await db.PushDeviceTokens.SingleOrDefaultAsync(item => item.CustomerId == customerId && item.Token == token, cancellationToken);
        if (current is null) db.PushDeviceTokens.Add(new PushDeviceToken(customerId, token, registeredAt));
        else db.Entry(current).Property(nameof(PushDeviceToken.RegisteredAt)).CurrentValue = registeredAt;
        await db.SaveChangesAsync(cancellationToken);
    }
    public async Task RemoveAsync(string customerId, string token, CancellationToken cancellationToken)
    {
        await db.PushDeviceTokens.Where(item => item.CustomerId == customerId && item.Token == token).ExecuteDeleteAsync(cancellationToken);
    }
}
