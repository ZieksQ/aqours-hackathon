namespace Aqours.Domain.Features.Reports;

public enum IssueType { NoWater, LowPressure, DirtyWater }
public enum ReportStatus { Submitted, InProgress, Resolved }

// Names are a snapshot of the canonical hierarchy at submission time.
public sealed record ReportAddress(string RegionCode, string RegionName, string? ProvinceCode, string? ProvinceName,
    string CityMunicipalityCode, string CityMunicipalityName, string? SubMunicipalityCode, string? SubMunicipalityName,
    string BarangayCode, string BarangayName, string Details)
{
    public const int MaxDetailsLength = 500;

    public bool IsValid() => !string.IsNullOrWhiteSpace(RegionCode) && !string.IsNullOrWhiteSpace(RegionName) &&
        !string.IsNullOrWhiteSpace(CityMunicipalityCode) && !string.IsNullOrWhiteSpace(CityMunicipalityName) &&
        !string.IsNullOrWhiteSpace(BarangayCode) && !string.IsNullOrWhiteSpace(BarangayName) &&
        ValidOptionalPair(ProvinceCode, ProvinceName) && ValidOptionalPair(SubMunicipalityCode, SubMunicipalityName) &&
        !string.IsNullOrWhiteSpace(Details) && Details == Details.Trim() && Details.Length <= MaxDetailsLength;

    private static bool ValidOptionalPair(string? code, string? name) =>
        code is null ? name is null : !string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(name);
}

public sealed class Report
{
    public const int MaxDescriptionLength = 2000;
    public Guid Id { get; private set; }
    public string CustomerId { get; private set; } = null!;
    public IssueType IssueType { get; private set; }
    public string Description { get; private set; } = null!;
    public ReportAddress Address { get; private set; } = null!;
    public double Latitude { get; private set; }
    public double Longitude { get; private set; }
    public ReportStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private Report() { }

    public Report(string customerId, IssueType issueType, string description, ReportAddress address,
        double latitude, double longitude, DateTimeOffset createdAt)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(customerId);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);
        ArgumentNullException.ThrowIfNull(address);
        if (!Enum.IsDefined(issueType)) throw new ArgumentOutOfRangeException(nameof(issueType));
        description = description.Trim();
        if (description.Length > MaxDescriptionLength) throw new ArgumentException("Description is too long.", nameof(description));
        if (!address.IsValid()) throw new ArgumentException("A resolved address and street or landmark details are required.", nameof(address));
        if (!ValidLatitude(latitude)) throw new ArgumentOutOfRangeException(nameof(latitude));
        if (!ValidLongitude(longitude)) throw new ArgumentOutOfRangeException(nameof(longitude));
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

    public static bool ValidLatitude(double value) => double.IsFinite(value) && value is >= -90 and <= 90;
    public static bool ValidLongitude(double value) => double.IsFinite(value) && value is >= -180 and <= 180;
}
