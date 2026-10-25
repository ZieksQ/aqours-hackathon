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

    private ReportMessage() { }

    public ReportMessage(Guid reportId, string senderId, string body, DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(senderId);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);
        body = body.Trim();
        if (body.Length > MaxBodyLength) throw new ArgumentException("Use up to 2,000 characters.", nameof(body));
        Id = Guid.NewGuid();
        ReportId = reportId;
        SenderId = senderId;
        Body = body;
        CreatedAt = now.ToUniversalTime();
    }
}
