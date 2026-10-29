namespace Aqours.Domain.Locations;

// Names are a snapshot of the canonical hierarchy at the time of saving.
public sealed record PsgcAddress(string RegionCode, string RegionName, string? ProvinceCode, string? ProvinceName,
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
