namespace Aqours.Domain.Features.SupplySites;

public enum SupplyStatus { Normal, Low, Unavailable }

public sealed class SupplyUpdate
{
    public const int MaxUpdaterNameLength = 201;
    public Guid Id { get; private set; }
    public long Sequence { get; private set; }
    public Guid SiteId { get; private set; }
    public SupplyStatus Status { get; private set; }
    public string UpdatedById { get; private set; } = null!;
    public string UpdatedByName { get; private set; } = null!;
    public DateTimeOffset UpdatedAt { get; private set; }

    private SupplyUpdate() { }

    public SupplyUpdate(Guid siteId, SupplyStatus status, string updatedById, string updatedByName, DateTimeOffset now)
    {
        if (siteId == Guid.Empty) throw new ArgumentException("A site is required.", nameof(siteId));
        if (!Enum.IsDefined(status)) throw new ArgumentOutOfRangeException(nameof(status));
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedById);
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedByName);
        if (updatedByName.Length > MaxUpdaterNameLength) throw new ArgumentException("Updater name is too long.", nameof(updatedByName));
        Id = Guid.NewGuid();
        SiteId = siteId;
        Status = status;
        UpdatedById = updatedById;
        UpdatedByName = updatedByName;
        // Match PostgreSQL microsecond precision so recording and subsequent reads return the same instant.
        var utc = now.ToUniversalTime();
        UpdatedAt = utc.AddTicks(-(utc.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
