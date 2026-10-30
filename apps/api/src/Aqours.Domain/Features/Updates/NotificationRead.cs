namespace Aqours.Domain.Features.Updates;

public sealed class NotificationRead
{
    public string CustomerId { get; private set; } = null!;
    public string EventId { get; private set; } = null!;
    public DateTimeOffset ReadAt { get; private set; }

    private NotificationRead() { }

    public NotificationRead(string customerId, string eventId, DateTimeOffset readAt)
    {
        CustomerId = customerId;
        EventId = eventId;
        ReadAt = readAt;
    }
}
