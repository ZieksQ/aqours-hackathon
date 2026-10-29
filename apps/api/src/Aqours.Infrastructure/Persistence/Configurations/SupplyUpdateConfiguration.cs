using Aqours.Domain.Features.SupplySites;
using Aqours.Infrastructure.Features.Accounts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Aqours.Infrastructure.Persistence.Configurations;

public sealed class SupplyUpdateConfiguration : IEntityTypeConfiguration<SupplyUpdate>
{
    public void Configure(EntityTypeBuilder<SupplyUpdate> builder)
    {
        builder.ToTable("supply_updates");
        builder.HasKey(update => update.Id);
        builder.Property(update => update.Sequence).ValueGeneratedOnAdd();
        builder.Property(update => update.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(update => update.UpdatedById).IsRequired();
        builder.Property(update => update.UpdatedByName).HasMaxLength(SupplyUpdate.MaxUpdaterNameLength).IsRequired();
        builder.Property(update => update.UpdatedAt).HasColumnType("timestamp with time zone");
        builder.HasOne<SupplySite>().WithMany().HasForeignKey(update => update.SiteId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<IdentityAccountUser>().WithMany().HasForeignKey(update => update.UpdatedById).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(update => new { update.SiteId, update.Sequence }).IsUnique().IsDescending(false, true);
    }
}
