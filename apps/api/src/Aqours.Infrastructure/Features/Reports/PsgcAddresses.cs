using System.Text.Json;
using Aqours.Application.Features.Accounts;
using Aqours.Application.Features.Reports;
using Aqours.Domain.Features.Reports;

namespace Aqours.Infrastructure.Features.Reports;

public sealed class PsgcAddresses : IPsgcAddresses
{
    private sealed record Place(string Code, string Name, string Level, Place? Parent);
    private readonly Dictionary<string, Place> _places = new(StringComparer.Ordinal);

    public PsgcAddresses()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "psgc");
        using var index = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "list-of-all-regions.json")));
        foreach (var region in index.RootElement.EnumerateArray())
        {
            using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, region.GetProperty("file").GetString()!)));
            Read(document.RootElement.GetProperty("region"), null);
        }
    }

    private void Read(JsonElement node, Place? parent)
    {
        var place = new Place(node.GetProperty("psgc_code").GetString()!, node.GetProperty("name").GetString()!,
            node.GetProperty("geographic_level").GetString()!, parent);
        _places.Add(place.Code, place);
        foreach (var child in node.GetProperty("children").EnumerateArray()) Read(child, place);
    }

    public Outcome<ReportAddress> Resolve(AddressInput address)
    {
        var errors = new Dictionary<string, string[]>();
        var submitted = new Dictionary<string, (string? Code, string[] Levels)>
        {
            ["regionCode"] = (address.RegionCode, ["region"]),
            ["provinceCode"] = (address.ProvinceCode, ["province"]),
            ["cityMunicipalityCode"] = (address.CityMunicipalityCode, ["city", "municipality"]),
            ["subMunicipalityCode"] = (address.SubMunicipalityCode, ["sub_municipality"]),
            ["barangayCode"] = (address.BarangayCode, ["barangay"])
        };
        foreach (var (field, (code, levels)) in submitted)
        {
            if (code is null && field is "provinceCode" or "subMunicipalityCode") continue;
            if (code is null || !_places.TryGetValue(code, out var place) || !levels.Contains(place.Level))
                errors[$"address.{field}"] = ["Select a valid PSGC location code."];
        }
        var path = new Dictionary<string, Place>();
        if (address.BarangayCode is not null && _places.TryGetValue(address.BarangayCode, out var barangay) && barangay.Level == "barangay")
        {
            for (Place? node = barangay; node is not null; node = node.Parent) path[node.Level] = node;
            foreach (var (field, (code, levels)) in submitted)
            {
                var expected = levels.Select(level => path.GetValueOrDefault(level)).FirstOrDefault(p => p is not null);
                if (code != expected?.Code)
                    errors[$"address.{field}"] = [expected is null ? "This address has no such administrative level; omit this code." : "Select the actual ancestor of the barangay, including all intermediate levels."];
            }
        }
        var details = address.Details?.Trim();
        if (string.IsNullOrEmpty(details) || details.Length > ReportAddress.MaxDetailsLength)
            errors["address.details"] = ["Street or landmark details are required (up to 500 characters)."];
        if (errors.Count > 0) return new(null, errors);
        var city = path.GetValueOrDefault("city") ?? path["municipality"];
        var province = path.GetValueOrDefault("province");
        var sub = path.GetValueOrDefault("sub_municipality");
        return new(new ReportAddress(path["region"].Code, path["region"].Name, province?.Code, province?.Name,
            city.Code, city.Name, sub?.Code, sub?.Name, path["barangay"].Code, path["barangay"].Name, details!));
    }
}
