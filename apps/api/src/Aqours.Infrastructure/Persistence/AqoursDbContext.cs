using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Persistence;

public sealed class AqoursDbContext(DbContextOptions<AqoursDbContext> options)
    : IdentityDbContext(options)
{
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Identity explicitly names these tables and indexes, overriding naming conventions.
        builder.Entity<IdentityUser>().ToTable("asp_net_users");
        builder.Entity<IdentityRole>().ToTable("asp_net_roles");
        builder.Entity<IdentityUserClaim<string>>().ToTable("asp_net_user_claims");
        builder.Entity<IdentityUserLogin<string>>().ToTable("asp_net_user_logins");
        builder.Entity<IdentityUserRole<string>>().ToTable("asp_net_user_roles");
        builder.Entity<IdentityUserToken<string>>().ToTable("asp_net_user_tokens");
        builder.Entity<IdentityRoleClaim<string>>().ToTable("asp_net_role_claims");

        builder.Entity<IdentityUser>().HasIndex(user => user.NormalizedEmail)
            .HasDatabaseName("email_index");
        builder.Entity<IdentityUser>().HasIndex(user => user.NormalizedUserName)
            .HasDatabaseName("user_name_index");
        builder.Entity<IdentityRole>().HasIndex(role => role.NormalizedName)
            .HasDatabaseName("role_name_index");
    }
}
