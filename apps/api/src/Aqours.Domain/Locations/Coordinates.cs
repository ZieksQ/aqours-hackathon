namespace Aqours.Domain.Locations;

public static class Coordinates
{
    public static bool ValidLatitude(double value) => double.IsFinite(value) && value is >= -90 and <= 90;
    public static bool ValidLongitude(double value) => double.IsFinite(value) && value is >= -180 and <= 180;
}
