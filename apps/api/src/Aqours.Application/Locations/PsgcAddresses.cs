using Aqours.Application.Features.Accounts;
using Aqours.Domain.Locations;

namespace Aqours.Application.Locations;

public sealed record AddressInput(string? RegionCode, string? ProvinceCode, string? CityMunicipalityCode,
    string? SubMunicipalityCode, string? BarangayCode, string? Details);

public interface IPsgcAddresses
{
    Outcome<PsgcAddress> Resolve(AddressInput address);
}
