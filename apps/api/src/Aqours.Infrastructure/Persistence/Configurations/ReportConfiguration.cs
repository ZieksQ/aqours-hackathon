using System.Text.Json;
using Aqours.Domain.Features.Reports;
using Aqours.Infrastructure.Features.Accounts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Aqours.Infrastructure.Persistence.Configurations;

public sealed class ReportConfiguration : IEntityTypeConfiguration<Report>
{
    public void Configure(EntityTypeBuilder<Report> builder)
    {
        builder.ToTable("reports");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.CustomerId).IsRequired();
        builder.Property(r => r.Description).HasMaxLength(Report.MaxDescriptionLength).IsRequired();
        builder.Property(r => r.IssueType).HasConversion<string>().HasMaxLength(20);
        builder.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(r => r.Address).HasColumnType("jsonb").IsRequired().HasConversion(
            address => JsonSerializer.Serialize(address, (JsonSerializerOptions?)null),
            json => JsonSerializer.Deserialize<ReportAddress>(json, (JsonSerializerOptions?)null)!);
        builder.HasOne<IdentityAccountUser>().WithMany().HasForeignKey(r => r.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(r => new { r.CustomerId, r.CreatedAt, r.Id }).IsDescending(false, true, true);
    }
}
