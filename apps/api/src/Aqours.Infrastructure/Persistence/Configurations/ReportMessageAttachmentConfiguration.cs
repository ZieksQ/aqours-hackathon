using Aqours.Domain.Features.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Aqours.Infrastructure.Persistence.Configurations;

public sealed class ReportMessageAttachmentConfiguration : IEntityTypeConfiguration<ReportMessageAttachment>
{
    public void Configure(EntityTypeBuilder<ReportMessageAttachment> attachment)
    {
        attachment.ToTable("report_message_attachments");
        attachment.HasKey(item => item.Id);
        attachment.Property(item => item.FileName).HasMaxLength(ReportMessageAttachment.MaxFileNameLength).IsRequired();
        attachment.Property(item => item.ContentType).HasMaxLength(64).IsRequired();
        attachment.Property(item => item.StorageKey).HasMaxLength(ReportMessageAttachment.MaxStorageKeyLength).IsRequired();
        attachment.Property(item => item.SizeBytes).IsRequired();
        attachment.Property(item => item.Position).IsRequired();
        attachment.HasOne(item => item.Message).WithMany(message => message.Attachments)
            .HasForeignKey(item => item.MessageId).OnDelete(DeleteBehavior.Restrict);
        attachment.HasIndex(item => new { item.MessageId, item.Position }).IsUnique();
        attachment.HasIndex(item => item.StorageKey).IsUnique();
    }
}
