using Aqours.Domain.Locations;

namespace Aqours.Domain.Features.Reports;

public enum IssueType { NoWater, LowPressure, DirtyWater }
public enum ReportPriority { Low, Normal, High }
public enum ReportStatus { Submitted, InProgress, Resolved }

public sealed class Report
{
    public const int MaxDescriptionLength = 2000;
    public Guid Id { get; private set; }
    public string CustomerId { get; private set; } = null!;
    public IssueType IssueType { get; private set; }
    public string Description { get; private set; } = null!;
    public PsgcAddress Address { get; private set; } = null!;
    public double Latitude { get; private set; }
    public double Longitude { get; private set; }
    public ReportStatus Status { get; private set; }
    public ReportPriority Priority { get; private set; } = ReportPriority.Normal;
    public string? AssignedStaffId { get; private set; }
    public DateTimeOffset? ClaimedAt { get; private set; }
    public DateTimeOffset? ResolvedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private Report() { }

    public Report(string customerId, IssueType issueType, string description, PsgcAddress address,
        double latitude, double longitude, DateTimeOffset createdAt)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(customerId);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);
        ArgumentNullException.ThrowIfNull(address);
        if (!Enum.IsDefined(issueType)) throw new ArgumentOutOfRangeException(nameof(issueType));
        description = description.Trim();
        if (description.Length > MaxDescriptionLength) throw new ArgumentException("Description is too long.", nameof(description));
        if (!address.IsValid()) throw new ArgumentException("A resolved address and street or landmark details are required.", nameof(address));
        if (!Coordinates.ValidLatitude(latitude)) throw new ArgumentOutOfRangeException(nameof(latitude));
        if (!Coordinates.ValidLongitude(longitude)) throw new ArgumentOutOfRangeException(nameof(longitude));
        Id = Guid.NewGuid();
        CustomerId = customerId;
        IssueType = issueType;
        Description = description;
        Address = address;
        Latitude = latitude;
        Longitude = longitude;
        // Use microsecond precision so creation and subsequent reads return the same timestamp.
        var utc = createdAt.ToUniversalTime();
        CreatedAt = utc.AddTicks(-(utc.Ticks % TimeSpan.TicksPerMicrosecond));
        Status = ReportStatus.Submitted;
    }

    public void Resolve(DateTimeOffset now)
    {
        if (Status != ReportStatus.InProgress || AssignedStaffId is null)
            throw new InvalidOperationException("Only a claimed report can be resolved.");
        Status = ReportStatus.Resolved;
        ResolvedAt = now;
    }

    public void ChangePriority(ReportPriority priority)
    {
        if (!Enum.IsDefined(priority)) throw new ArgumentOutOfRangeException(nameof(priority));
        if (Status != ReportStatus.InProgress) throw new InvalidOperationException("Only active claimed reports can be changed.");
        Priority = priority;
    }
}
