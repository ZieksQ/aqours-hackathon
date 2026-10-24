using Aqours.Domain.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Aqours.Infrastructure.Features.Accounts;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Aqours.Infrastructure.Persistence.Seeders;

public sealed class AccountSeeder(AqoursDbContext db, RoleManager<IdentityRole> roles,
    UserManager<IdentityAccountUser> users, AccountService accounts, IConfiguration configuration) : IAccountSeeder
{
    public async Task SeedAsync()
    {
        if ((await db.Database.GetPendingMigrationsAsync()).Any())
            throw new InvalidOperationException("Database schema is not ready. Apply migrations explicitly; see docs/authentication.md.");
        // Prevent two API instances from both creating the initial roles/admin.
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(518406927)");
        foreach (var role in AccountRoles.All)
            if (!await roles.RoleExistsAsync(role)) Ensure(await roles.CreateAsync(new(role)));
        var seed = configuration.GetSection("SeedAdmin");
        var email = seed["Email"];
        if (string.IsNullOrWhiteSpace(email))
            throw new InvalidOperationException("Configure SeedAdmin:Email, FirstName, LastName and Password using environment variables or user secrets.");
        var existing = await users.FindByEmailAsync(email.Trim());
        if (existing is not null)
        {
            var assigned = await users.GetRolesAsync(existing);
            if (assigned.Count != 1 || assigned[0] != AccountRoles.Admin)
                throw new InvalidOperationException("SeedAdmin:Email conflicts with an existing non-Admin account. No account was promoted or password reset.");
        }
        else
        {
            // The enclosing transaction makes role creation and admin creation atomic.
            var request = new CreateAccount(email, seed["FirstName"]!, seed["MiddleName"], seed["LastName"]!, seed["Password"]!, AccountRoles.Admin);
            var result = await accounts.CreateAsync(request);
            if (!result.Succeeded) throw new InvalidOperationException("SeedAdmin configuration is invalid: " +
                string.Join(" ", result.Errors!.SelectMany(e => e.Value)));
        }
        await transaction.CommitAsync();
    }

    private static void Ensure(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException(string.Join(" ", result.Errors.Select(e => e.Description)));
    }

}
