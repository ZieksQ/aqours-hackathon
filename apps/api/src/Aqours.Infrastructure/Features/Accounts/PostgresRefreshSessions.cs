using Aqours.Domain.Features.Accounts;
using System.Security.Cryptography;
using System.Text;
using Aqours.Application.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Accounts;

public sealed class PostgresRefreshSessions(AqoursDbContext db, IAccountStore accounts, TimeProvider clock) : IRefreshSessions
{
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string RandomToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

    public async Task<RefreshSession> CreateAsync(AccountSession session)
    {
        if (session.Account.Role != AccountRoles.Customer || session.Account.RequiresPasswordChange)
            throw new InvalidOperationException("Only onboarded Customers may receive refresh sessions.");
        var family = new RefreshFamily
        {
            Id = Guid.NewGuid(),
            UserId = session.Account.Id,
            SecurityStamp = session.SecurityStamp,
            ExpiresAt = clock.GetUtcNow().AddDays(7)
        };
        var token = RandomToken();
        db.Add(family);
        db.Add(new RefreshToken { Hash = Hash(token), FamilyId = family.Id });
        await db.SaveChangesAsync();
        return new(session, token, family.ExpiresAt);
    }

    public async Task<RefreshSession?> RotateAsync(string token)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 512) return null;
        var hash = Hash(token);
        var familyId = await db.Set<RefreshToken>().Where(t => t.Hash == hash).Select(t => (Guid?)t.FamilyId).SingleOrDefaultAsync();
        if (familyId is null) return null;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Every operation locks the family first, including logout; replay revokes all descendants.
        var family = await db.Set<RefreshFamily>().FromSqlInterpolated($"SELECT * FROM refresh_families WHERE id = {familyId.Value} FOR UPDATE").SingleAsync();
        var stored = await db.Set<RefreshToken>().SingleAsync(t => t.Hash == hash);
        var session = await accounts.FindAsync(family.UserId);
        if (family.Revoked || family.ExpiresAt <= clock.GetUtcNow() || stored.Consumed || session is null ||
            session.SecurityStamp != family.SecurityStamp || session.Account.RequiresPasswordChange || session.Account.Role != AccountRoles.Customer)
        {
            family.Revoked = true;
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return null;
        }
        stored.Consumed = true;
        var next = RandomToken();
        db.Add(new RefreshToken { Hash = Hash(next), FamilyId = family.Id });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new(session, next, family.ExpiresAt);
    }

    public async Task RevokeAsync(string token)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 512) return;
        var hash = Hash(token);
        var id = await db.Set<RefreshToken>().Where(t => t.Hash == hash).Select(t => (Guid?)t.FamilyId).SingleOrDefaultAsync();
        if (id is null) return;
        await db.Set<RefreshFamily>().Where(f => f.Id == id).ExecuteUpdateAsync(s => s.SetProperty(f => f.Revoked, true));
    }
}
