using Aqours.Application.Features.Accounts;
using Aqours.Application.Locations;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Locations;

namespace Aqours.Application.Features.SupplySites;

public sealed record SaveSupplySite(string? Name, AddressInput? Address, double? Latitude, double? Longitude);
public sealed record SupplySitePage(IReadOnlyList<SupplySite> Items, int Page, int PageSize, int TotalCount);
public sealed record SupplySiteSaveResult(SupplySite? Site = null, Dictionary<string, string[]>? Errors = null);

public interface ISupplySiteStore
{
    Task AddAsync(SupplySite site, CancellationToken cancellationToken);
    Task<SupplySite?> FindAsync(Guid id, CancellationToken cancellationToken);
    Task UpdateAsync(SupplySite site, CancellationToken cancellationToken);
    Task<SupplySitePage> ListAsync(int page, int pageSize, CancellationToken cancellationToken);
}

public sealed class SupplySiteService(ISupplySiteStore store, IPsgcAddresses addresses, TimeProvider clock)
{
    public Task<SupplySite?> FindAsync(Guid id, CancellationToken cancellationToken = default) =>
        store.FindAsync(id, cancellationToken);

    public async Task<Outcome<SupplySitePage>> ListAsync(int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        if (page < 1) errors["page"] = ["Page must be positive."];
        if (pageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        if (errors.Count > 0) return new(null, errors);
        return new(await store.ListAsync(page, pageSize, cancellationToken));
    }

    public async Task<SupplySiteSaveResult> CreateAsync(SaveSupplySite input, CancellationToken cancellationToken = default)
    {
        var resolved = Validate(input);
        if (!resolved.Succeeded) return new(Errors: resolved.Errors);
        var site = new SupplySite(input.Name!, resolved.Value!, input.Latitude!.Value, input.Longitude!.Value, clock.GetUtcNow());
        await store.AddAsync(site, cancellationToken);
        return new(site);
    }

    public async Task<SupplySiteSaveResult> UpdateAsync(Guid id, SaveSupplySite input, CancellationToken cancellationToken = default)
    {
        var site = await store.FindAsync(id, cancellationToken);
        if (site is null) return new();
        var resolved = Validate(input);
        if (!resolved.Succeeded) return new(Errors: resolved.Errors);
        site.Replace(input.Name!, resolved.Value!, input.Latitude!.Value, input.Longitude!.Value, clock.GetUtcNow());
        await store.UpdateAsync(site, cancellationToken);
        return new(site);
    }

    private Outcome<PsgcAddress> Validate(SaveSupplySite input)
    {
        var errors = new Dictionary<string, string[]>();
        var name = input.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > SupplySite.MaxNameLength)
            errors["name"] = ["Name is required (up to 200 characters)."];
        if (input.Latitude is not { } latitude || !Coordinates.ValidLatitude(latitude))
            errors["latitude"] = ["Latitude is required and must be a finite number between -90 and 90."];
        if (input.Longitude is not { } longitude || !Coordinates.ValidLongitude(longitude))
            errors["longitude"] = ["Longitude is required and must be a finite number between -180 and 180."];
        PsgcAddress? address = null;
        if (input.Address is null) errors["address"] = ["Address is required."];
        else
        {
            var resolved = addresses.Resolve(input.Address);
            address = resolved.Value;
            if (resolved.Errors is not null)
                foreach (var error in resolved.Errors) errors[error.Key] = error.Value;
        }
        return errors.Count > 0 ? new(null, errors) : new(address);
    }
}
