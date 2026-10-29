using System.Globalization;
using Aqours.Api.Features.Accounts;
using Aqours.Api.Locations;
using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.SupplySites;

namespace Aqours.Api.Features.SupplySites;

public sealed record SaveSupplySiteRequest(string? Name, AddressRequest? Address, double? Latitude, double? Longitude)
{
    public SaveSupplySite ToInput() => new(Name, Address is null ? null :
        new(Address.RegionCode, Address.ProvinceCode, Address.CityMunicipalityCode, Address.SubMunicipalityCode,
            Address.BarangayCode, Address.Details), Latitude, Longitude);
}

public sealed record SupplySiteResponse(Guid Id, string Name, AddressResponse Address, double Latitude, double Longitude,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt)
{
    public static SupplySiteResponse From(SupplySite site)
    {
        var a = site.Address;
        return new(site.Id, site.Name, new(a.RegionCode, a.RegionName, a.ProvinceCode, a.ProvinceName,
            a.CityMunicipalityCode, a.CityMunicipalityName, a.SubMunicipalityCode, a.SubMunicipalityName,
            a.BarangayCode, a.BarangayName, a.Details), site.Latitude, site.Longitude, site.CreatedAt, site.UpdatedAt);
    }
}

public sealed record SupplySitePageResponse(IReadOnlyList<SupplySiteResponse> Items, int Page, int PageSize, int TotalCount);

public static class SupplySiteEndpoints
{
    public static void MapSupplySiteEndpoints(this WebApplication app)
    {
        var sites = app.MapGroup("/api/admin/supply-sites").RequireAuthorization("Admin");
        sites.MapGet("", async (SupplySiteService service, CancellationToken cancellationToken, string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var pageNumber = ParsePagination(page, 1, "page", errors);
            var size = ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.ListAsync(pageNumber, size, cancellationToken);
            if (!result.Succeeded) return Results.ValidationProblem(result.Errors!);
            var value = result.Value!;
            return Results.Ok(new SupplySitePageResponse(value.Items.Select(SupplySiteResponse.From).ToList(), value.Page, value.PageSize, value.TotalCount));
        });
        sites.MapGet("/{id:guid}", async (Guid id, SupplySiteService service, CancellationToken cancellationToken) =>
        {
            var site = await service.FindAsync(id, cancellationToken);
            return site is null ? Results.NotFound() : Results.Ok(SupplySiteResponse.From(site));
        });
        sites.MapPost("", async (SaveSupplySiteRequest request, SupplySiteService service, CancellationToken cancellationToken) =>
        {
            var result = await service.CreateAsync(request.ToInput(), cancellationToken);
            return result.Site is { } site ? Results.Created($"/api/admin/supply-sites/{site.Id}", SupplySiteResponse.From(site)) :
                Results.ValidationProblem(result.Errors!);
        }).AddEndpointFilter<CsrfFilter>();
        sites.MapPut("/{id:guid}", async (Guid id, SaveSupplySiteRequest request, SupplySiteService service, CancellationToken cancellationToken) =>
        {
            var result = await service.UpdateAsync(id, request.ToInput(), cancellationToken);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            return result.Site is { } site ? Results.Ok(SupplySiteResponse.From(site)) : Results.NotFound();
        }).AddEndpointFilter<CsrfFilter>();
    }

    internal static int ParsePagination(string? value, int fallback, string field, Dictionary<string, string[]> errors)
    {
        if (value is null) return fallback;
        if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)) return number;
        errors[field] = ["Enter a valid integer."];
        return fallback;
    }
}
