using System.Text.Json;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Locations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Aqours.Infrastructure.Persistence.Configurations;

public sealed class SupplySiteConfiguration : IEntityTypeConfiguration<SupplySite>
{
    public void Configure(EntityTypeBuilder<SupplySite> builder)
    {
        builder.ToTable("supply_sites");
        builder.HasKey(site => site.Id);
        builder.Property(site => site.Name).HasMaxLength(SupplySite.MaxNameLength).IsRequired();
        builder.Property(site => site.Address).HasColumnType("jsonb").IsRequired().HasConversion(
            address => JsonSerializer.Serialize(address, (JsonSerializerOptions?)null),
            json => JsonSerializer.Deserialize<PsgcAddress>(json, (JsonSerializerOptions?)null)!);
        builder.HasIndex(site => new { site.Name, site.Id });
    }
}
