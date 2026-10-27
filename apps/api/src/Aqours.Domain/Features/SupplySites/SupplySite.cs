using Aqours.Domain.Locations;

namespace Aqours.Domain.Features.SupplySites;

public sealed class SupplySite
{
    public const int MaxNameLength = 200;
    public Guid Id { get; private set; }
    public string Name { get; private set; } = null!;
    public PsgcAddress Address { get; private set; } = null!;
    public double Latitude { get; private set; }
    public double Longitude { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    private SupplySite() { }

    public SupplySite(string name, PsgcAddress address, double latitude, double longitude, DateTimeOffset now)
    {
        Replace(name, address, latitude, longitude, now);
        Id = Guid.NewGuid();
        CreatedAt = UpdatedAt;
    }

    public void Replace(string name, PsgcAddress address, double latitude, double longitude, DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(address);
        name = name.Trim();
        if (name.Length > MaxNameLength) throw new ArgumentException("Name is too long.", nameof(name));
        if (!address.IsValid()) throw new ArgumentException("A resolved address and street or landmark details are required.", nameof(address));
        if (!Coordinates.ValidLatitude(latitude)) throw new ArgumentOutOfRangeException(nameof(latitude));
        if (!Coordinates.ValidLongitude(longitude)) throw new ArgumentOutOfRangeException(nameof(longitude));
        Name = name;
        Address = address;
        Latitude = latitude;
        Longitude = longitude;
        // PostgreSQL stores timestamps at microsecond precision; keep mutation responses consistent with reads.
        var utc = now.ToUniversalTime();
        UpdatedAt = utc.AddTicks(-(utc.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
