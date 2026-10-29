namespace Aqours.Api.Locations;

public sealed record AddressRequest(string? RegionCode, string? ProvinceCode, string? CityMunicipalityCode,
    string? SubMunicipalityCode, string? BarangayCode, string? Details);
public sealed record AddressResponse(string RegionCode, string RegionName, string? ProvinceCode, string? ProvinceName,
    string CityMunicipalityCode, string CityMunicipalityName, string? SubMunicipalityCode, string? SubMunicipalityName,
    string BarangayCode, string BarangayName, string Details);
