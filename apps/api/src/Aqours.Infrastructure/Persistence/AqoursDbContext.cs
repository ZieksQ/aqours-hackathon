using Aqours.Domain.Features.Weather;
using Aqours.Infrastructure.Features.Weather;
using Aqours.Infrastructure.Features.Accounts;
using Aqours.Domain.Features.Reports;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Features.Updates;
using Aqours.Infrastructure.Persistence.Configurations;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Persistence;

public sealed class AqoursDbContext(DbContextOptions<AqoursDbContext> options)
    : IdentityDbContext<IdentityAccountUser>(options)
{
    public DbSet<WeatherSettings> WeatherSettings => Set<WeatherSettings>();

    public DbSet<WeatherForecastRecord> WeatherForecasts => Set<WeatherForecastRecord>();

    public DbSet<SupplySite> SupplySites => Set<SupplySite>();

    public DbSet<SupplyUpdate> SupplyUpdates => Set<SupplyUpdate>();

    public DbSet<Report> Reports => Set<Report>();

    public DbSet<ReportMessage> ReportMessages => Set<ReportMessage>();

    public DbSet<NotificationRead> NotificationReads => Set<NotificationRead>();
    public DbSet<PushDeviceToken> PushDeviceTokens => Set<PushDeviceToken>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfiguration(new ReportConfiguration());
        builder.ApplyConfiguration(new SupplySiteConfiguration());
        builder.ApplyConfiguration(new SupplyUpdateConfiguration());
        builder.ApplyConfiguration(new WeatherSettingsConfiguration());
        builder.ApplyConfiguration(new WeatherForecastConfiguration());
        builder.Entity<ReportMessage>(message =>
        {
            message.ToTable("report_messages");
            message.HasKey(m => m.Id);
            message.Property(m => m.Sequence).ValueGeneratedOnAdd();
            message.Property(m => m.Body).HasMaxLength(ReportMessage.MaxBodyLength).IsRequired();
            message.HasOne<Report>().WithMany().HasForeignKey(m => m.ReportId).OnDelete(DeleteBehavior.Restrict);
            message.HasOne<IdentityAccountUser>().WithMany().HasForeignKey(m => m.SenderId).OnDelete(DeleteBehavior.Restrict);
            message.HasIndex(m => new { m.ReportId, m.Sequence }).IsUnique();
        });
        builder.Entity<NotificationRead>(read =>
        {
            read.ToTable("notification_reads");
            read.HasKey(item => new { item.CustomerId, item.EventId });
            read.Property(item => item.CustomerId).HasMaxLength(450).IsRequired();
            read.Property(item => item.EventId).HasMaxLength(256).IsRequired();
            read.HasOne<IdentityAccountUser>().WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Cascade);
        });
        builder.Entity<PushDeviceToken>(device =>
        {
            device.ToTable("push_device_tokens");
            device.HasKey(item => new { item.CustomerId, item.Token });
            device.Property(item => item.CustomerId).HasMaxLength(450).IsRequired();
            device.Property(item => item.Token).HasMaxLength(512).IsRequired();
            device.HasOne<IdentityAccountUser>().WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<IdentityAccountUser>().Property(u => u.FirstName).HasMaxLength(100).IsRequired();
        builder.Entity<IdentityAccountUser>().Property(u => u.LastName).HasMaxLength(100).IsRequired();
        builder.Entity<IdentityAccountUser>().Property(u => u.MiddleName).HasMaxLength(100);
        builder.Entity<IdentityUserRole<string>>().HasIndex(r => r.UserId).IsUnique();
        builder.Entity<RefreshFamily>().ToTable("refresh_families");
        builder.Entity<RefreshFamily>().HasKey(f => f.Id);
        builder.Entity<RefreshFamily>().HasOne<IdentityAccountUser>().WithMany().HasForeignKey(f => f.UserId);
        builder.Entity<RefreshToken>().ToTable("refresh_tokens");
        builder.Entity<RefreshToken>().HasKey(t => t.Hash);
        builder.Entity<RefreshToken>().Property(t => t.Hash).HasMaxLength(64);
        builder.Entity<RefreshToken>().HasOne<RefreshFamily>().WithMany().HasForeignKey(t => t.FamilyId);

        // Identity explicitly names these tables and indexes, overriding naming conventions.
        builder.Entity<IdentityAccountUser>().ToTable("asp_net_users");
        builder.Entity<IdentityRole>().ToTable("asp_net_roles");
        builder.Entity<IdentityUserClaim<string>>().ToTable("asp_net_user_claims");
        builder.Entity<IdentityUserLogin<string>>().ToTable("asp_net_user_logins");
        builder.Entity<IdentityUserRole<string>>().ToTable("asp_net_user_roles");
        builder.Entity<IdentityUserToken<string>>().ToTable("asp_net_user_tokens");
        builder.Entity<IdentityRoleClaim<string>>().ToTable("asp_net_role_claims");

        builder.Entity<IdentityAccountUser>().HasIndex(user => user.NormalizedEmail)
            .IsUnique().HasDatabaseName("email_index");
        builder.Entity<IdentityAccountUser>().HasIndex(user => user.NormalizedUserName)
            .HasDatabaseName("user_name_index");
        builder.Entity<IdentityRole>().HasIndex(role => role.NormalizedName)
            .HasDatabaseName("role_name_index");
    }
}
