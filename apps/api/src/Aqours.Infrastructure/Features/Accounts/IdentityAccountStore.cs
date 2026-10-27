using Aqours.Domain.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Aqours.Infrastructure.Features.Accounts;

public sealed class IdentityAccountStore(UserManager<IdentityAccountUser> users, AqoursDbContext db) : IAccountStore
{
    public async Task<AccountSession?> AuthenticateAsync(string email, string password)
    {
        var user = await users.FindByEmailAsync(email);
        if (user is null) return null;
        // Serialize checks so concurrent bad passwords cannot bypass the lockout counter.
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM asp_net_users WHERE id = {user.Id} FOR UPDATE");
        await db.Entry(user).ReloadAsync();
        if (await users.IsLockedOutAsync(user)) return null;
        if (!await users.CheckPasswordAsync(user, password))
        {
            await users.AccessFailedAsync(user);
            await transaction.CommitAsync();
            return null;
        }
        await users.ResetAccessFailedCountAsync(user);
        await transaction.CommitAsync();
        return await SessionAsync(user);
    }

    public async Task<AccountSession?> FindAsync(string id)
    {
        var user = await users.FindByIdAsync(id);
        return user is null ? null : await SessionAsync(user);
    }

    public async Task<IReadOnlyList<Account>> ListAsync(CancellationToken ct = default) =>
        await (from user in db.Users.AsNoTracking()
               join membership in db.UserRoles on user.Id equals membership.UserId
               join role in db.Roles on membership.RoleId equals role.Id
               where role.Name != null && AccountRoles.All.Contains(role.Name)
               orderby role.Name == AccountRoles.Admin ? 0 : role.Name == AccountRoles.Staff ? 1 : 2,
                   user.FirstName, user.LastName, user.Id
               select new Account(user.Id, user.Email!, user.FirstName, user.MiddleName, user.LastName,
                   role.Name!, user.RequiresPasswordChange)).ToListAsync(ct);

    private async Task<AccountSession?> SessionAsync(IdentityAccountUser user)
    {
        var roles = await users.GetRolesAsync(user);
        if (roles.Count != 1 || !AccountRoles.All.Contains(roles[0])) return null;
        return new(new(user.Id, user.Email!, user.FirstName, user.MiddleName, user.LastName,
            roles[0], user.RequiresPasswordChange), user.SecurityStamp!);
    }

    public async Task<Outcome<AccountSession>> CreateAsync(CreateAccount account)
    {
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync() : null;
        var user = new IdentityAccountUser
        {
            UserName = account.Email,
            Email = account.Email,
            FirstName = account.FirstName,
            MiddleName = account.MiddleName,
            LastName = account.LastName
        };
        try
        {
            var created = await users.CreateAsync(user, account.InitialPassword);
            if (!created.Succeeded) return Errors(created, "initialPassword");
            var role = await users.AddToRoleAsync(user, account.Role);
            if (!role.Succeeded) return Errors(role, "role");
            if (transaction is not null) await transaction.CommitAsync();
            return new(await SessionAsync(user));
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return Outcome<AccountSession>.Invalid("email", "This email address is already in use.");
        }
    }

    public async Task<Outcome<AccountSession>> ChangePasswordAsync(string id, string currentPassword, string newPassword)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var user = await users.FindByIdAsync(id);
        if (user is null) return Outcome<AccountSession>.Denied();
        var changed = await users.ChangePasswordAsync(user, currentPassword, newPassword);
        if (!changed.Succeeded) return Errors(changed, "newPassword");
        user.RequiresPasswordChange = false;
        var updated = await users.UpdateAsync(user);
        if (!updated.Succeeded) return Errors(updated, "newPassword");
        await db.Set<RefreshFamily>().Where(f => f.UserId == id).ExecuteUpdateAsync(s => s.SetProperty(f => f.Revoked, true));
        await transaction.CommitAsync();
        return new(await SessionAsync(user));
    }

    private static Outcome<AccountSession> Errors(IdentityResult result, string passwordField) => new(null,
        result.Errors.GroupBy(e => e.Code.Contains("Email") || e.Code.Contains("UserName") ? "email" :
            e.Code == "PasswordMismatch" ? "currentPassword" : passwordField)
        .ToDictionary(g => g.Key, g => g.Select(e => e.Code is "DuplicateEmail" or "DuplicateUserName" ? "This email address is already in use." : e.Description).Distinct().ToArray()));
}
