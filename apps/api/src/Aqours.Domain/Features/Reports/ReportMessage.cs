namespace Aqours.Domain.Features.Reports;

public sealed class ReportMessage
{
    public const int MaxBodyLength = 2000;
    public Guid Id { get; private set; }
    public long Sequence { get; private set; }
    public Guid ReportId { get; private set; }
    public string SenderId { get; private set; } = null!;
    public string Body { get; private set; } = null!;
    public DateTimeOffset CreatedAt { get; private set; }
    public List<ReportMessageAttachment> Attachments { get; private set; } = [];

    private ReportMessage() { }

    public ReportMessage(Guid reportId, string senderId, string body, DateTimeOffset now, bool allowEmptyBody = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(senderId);
        ArgumentNullException.ThrowIfNull(body);
        body = body.Trim();
        if (!allowEmptyBody && body.Length == 0) throw new ArgumentException("A message body is required.", nameof(body));
        if (body.Length > MaxBodyLength) throw new ArgumentException("Use up to 2,000 characters.", nameof(body));
        Id = Guid.NewGuid();
        ReportId = reportId;
        SenderId = senderId;
        Body = body;
        CreatedAt = now.ToUniversalTime();
    }

    public void AddAttachment(ReportMessageAttachment attachment)
    {
        ArgumentNullException.ThrowIfNull(attachment);
        if (attachment.MessageId != Id) throw new ArgumentException("The attachment belongs to a different message.", nameof(attachment));
        if (Attachments.Any(existing => existing.Id == attachment.Id || existing.Position == attachment.Position))
            throw new ArgumentException("Attachment IDs and positions must be unique within a message.", nameof(attachment));
        Attachments.Add(attachment);
    }
}
