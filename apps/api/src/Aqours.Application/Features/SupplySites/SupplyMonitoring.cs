using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Features.SupplySites;

namespace Aqours.Application.Features.SupplySites;

public sealed record MonitoredSupplySite(SupplySite Site, SupplyUpdate? LatestSupply);
public sealed record MonitoredSupplySitePage(IReadOnlyList<MonitoredSupplySite> Items, int Page, int PageSize, int TotalCount);
public sealed record SupplyUpdatePage(IReadOnlyList<SupplyUpdate> Items, int Page, int PageSize, int TotalCount);

public interface ISupplyMonitoringStore
{
    Task<bool> SiteExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<MonitoredSupplySite?> FindAsync(Guid id, CancellationToken cancellationToken);
    Task<MonitoredSupplySitePage> ListAsync(int page, int pageSize, CancellationToken cancellationToken);
    Task AddAsync(SupplyUpdate update, CancellationToken cancellationToken);
    Task<SupplyUpdatePage> HistoryAsync(Guid siteId, int page, int pageSize, CancellationToken cancellationToken);
}

public sealed class SupplyMonitoringService(ISupplyMonitoringStore store, IAccountStore accounts, TimeProvider clock)
{
    public Task<MonitoredSupplySite?> FindAsync(Guid id, CancellationToken cancellationToken = default) =>
        store.FindAsync(id, cancellationToken);

    public async Task<Outcome<MonitoredSupplySitePage>> ListAsync(int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var errors = ValidatePagination(page, pageSize);
        if (errors.Count > 0) return new(null, errors);
        return new(await store.ListAsync(page, pageSize, cancellationToken));
    }

    public async Task<Outcome<SupplyUpdatePage>> HistoryAsync(Guid siteId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var errors = ValidatePagination(page, pageSize);
        if (errors.Count > 0) return new(null, errors);
        if (!await store.SiteExistsAsync(siteId, cancellationToken)) return new(null);
        return new(await store.HistoryAsync(siteId, page, pageSize, cancellationToken));
    }

    public async Task<Outcome<SupplyUpdate>> RecordAsync(Guid siteId, string updaterId, string? status, CancellationToken cancellationToken = default)
    {
        var account = (await accounts.FindAsync(updaterId))?.Account;
        if (account is null || account.Role != AccountRoles.Staff || account.RequiresPasswordChange)
            return Outcome<SupplyUpdate>.Denied();
        if (status is not ("Normal" or "Low" or "Unavailable"))
            return Outcome<SupplyUpdate>.Invalid("status", "Choose Normal, Low, or Unavailable.");
        if (!await store.SiteExistsAsync(siteId, cancellationToken)) return new(null);
        var update = new SupplyUpdate(siteId, Enum.Parse<SupplyStatus>(status), account.Id,
            account.FirstName + " " + account.LastName, clock.GetUtcNow());
        await store.AddAsync(update, cancellationToken);
        return new(update);
    }

    private static Dictionary<string, string[]> ValidatePagination(int page, int pageSize)
    {
        var errors = new Dictionary<string, string[]>();
        if (page < 1) errors["page"] = ["Page must be positive."];
        if (pageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        return errors;
    }
}
