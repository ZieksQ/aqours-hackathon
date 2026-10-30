using Aqours.Application.Features.Accounts;
using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.Weather;

namespace Aqours.Application.Features.Weather;

public sealed record ForecastCache(Guid SiteId, double Latitude, double Longitude, DateOnly WindowStart,
    DateTimeOffset? RetrievedAt, DateTimeOffset? RetryAfter, IReadOnlyList<ForecastTemperature> Days);
public sealed record SiteWeather(MonitoredSupplySite Site, double HeatThresholdCelsius, ForecastCache Forecast, WeatherAssessment Assessment);
public sealed record SiteWeatherPage(IReadOnlyList<SiteWeather> Items, int Page, int PageSize, int TotalCount);

public interface IWeatherStore
{
    Task<WeatherSettings> GetSettingsAsync(CancellationToken ct);
    Task SaveSettingsAsync(WeatherSettings settings, CancellationToken ct);
    Task<ForecastCache?> GetForecastAsync(Guid siteId, CancellationToken ct);
    Task SaveForecastAsync(ForecastCache cache, CancellationToken ct);
}

public interface IWeatherForecastProvider
{
    // Null means provider failure. Partial forecasts contain null temperatures for missing days.
    Task<IReadOnlyList<ForecastTemperature>?> FetchAsync(double latitude, double longitude, DateOnly today, CancellationToken ct);
}

// Fixed lock stripes bound process memory while coordinating refreshes across request scopes.
public sealed class WeatherRefreshCoordinator : IDisposable
{
    private readonly SemaphoreSlim[] _sites = Enumerable.Range(0, 128).Select(_ => new SemaphoreSlim(1)).ToArray();
    public SemaphoreSlim ProviderSlots { get; } = new(4);
    public SemaphoreSlim SiteLock(Guid id) => _sites[(uint)id.GetHashCode() % (uint)_sites.Length];
    public void Dispose()
    {
        foreach (var gate in _sites) gate.Dispose();
        ProviderSlots.Dispose();
    }
}

public sealed class WeatherService(IWeatherStore store, ISupplyMonitoringStore sites, IWeatherForecastProvider provider,
    WeatherRefreshCoordinator coordinator, TimeProvider clock)
{
    public Task<WeatherSettings> SettingsAsync(CancellationToken ct = default) => store.GetSettingsAsync(ct);

    public async Task<Outcome<WeatherSettings>> ChangeSettingsAsync(double? threshold, CancellationToken ct = default)
    {
        if (threshold is not { } value || !WeatherSettings.ValidThreshold(value))
            return Outcome<WeatherSettings>.Invalid("heatThresholdCelsius", "Enter a Celsius threshold between 0 and 60.");
        var settings = await store.GetSettingsAsync(ct);
        settings.ChangeThreshold(value, clock.GetUtcNow());
        await store.SaveSettingsAsync(settings, ct);
        return new(settings);
    }

    public async Task<SiteWeather?> FindAsync(Guid id, CancellationToken ct = default)
    {
        var site = await sites.FindAsync(id, ct);
        if (site is null) return null;
        var forecast = await ForecastAsync(site, ct);
        // Read rule inputs after the provider wait so threshold/supply mutations are reflected immediately.
        site = await sites.FindAsync(id, ct);
        if (site is null) return null;
        if (!Matches(forecast, site)) forecast = await ForecastAsync(site, ct);
        var settings = await store.GetSettingsAsync(ct);
        return Assess(site, settings, forecast);
    }

    public async Task<Outcome<SiteWeatherPage>> ListAsync(int page, int pageSize, CancellationToken ct = default)
    {
        var errors = new Dictionary<string, string[]>();
        if (page < 1) errors["page"] = ["Page must be positive."];
        if (pageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        if (errors.Count > 0) return new(null, errors);
        var result = await sites.ListAsync(page, pageSize, ct);
        // Parallel provider reads use independent store contexts; never share the supply query's DbContext.
        var forecasts = await Task.WhenAll(result.Items.Select(site => ForecastAsync(site, ct)));
        var settings = await store.GetSettingsAsync(ct);
        var items = new List<SiteWeather>();
        for (var i = 0; i < result.Items.Count; i++)
        {
            var site = await sites.FindAsync(result.Items[i].Site.Id, ct);
            if (site is null) continue;
            var forecast = Matches(forecasts[i], site) ? forecasts[i] : await ForecastAsync(site, ct);
            items.Add(Assess(site, settings, forecast));
        }
        return new(new(items, page, pageSize, result.TotalCount));
    }

    private SiteWeather Assess(MonitoredSupplySite site, WeatherSettings settings, ForecastCache cache) =>
        new(site, settings.HeatThresholdCelsius, cache, WeatherRules.Assess(clock.GetUtcNow(), settings.HeatThresholdCelsius,
            site.LatestSupply?.Status, site.LatestSupply?.UpdatedAt, cache.RetrievedAt, cache.Days));

    private static bool Matches(ForecastCache cache, MonitoredSupplySite site) =>
        cache.Latitude == site.Site.Latitude && cache.Longitude == site.Site.Longitude;

    private async Task<ForecastCache> ForecastAsync(MonitoredSupplySite site, CancellationToken ct)
    {
        var gate = coordinator.SiteLock(site.Site.Id);
        await gate.WaitAsync(ct);
        try
        {
            var now = clock.GetUtcNow();
            var today = WeatherRules.PhilippineDate(now);
            var cache = await store.GetForecastAsync(site.Site.Id, ct);
            if (cache is null || !Matches(cache, site))
                cache = new(site.Site.Id, site.Site.Latitude, site.Site.Longitude, today, null, null, []);
            var needsRefresh = cache.RetrievedAt is null || now - cache.RetrievedAt >= WeatherRules.ForecastFreshness || cache.WindowStart != today;
            if (!needsRefresh || cache.RetryAfter > now) return cache;
            await coordinator.ProviderSlots.WaitAsync(ct);
            try
            {
                // A request queued behind other sites may cross local midnight.
                today = WeatherRules.PhilippineDate(clock.GetUtcNow());
                var days = await provider.FetchAsync(cache.Latitude, cache.Longitude, today, ct);
                now = clock.GetUtcNow();
                cache = days is null ? cache with { RetryAfter = now.AddMinutes(5) }
                    : cache with { WindowStart = today, RetrievedAt = now, RetryAfter = null, Days = days };
                await store.SaveForecastAsync(cache, ct);
                return cache;
            }
            finally { coordinator.ProviderSlots.Release(); }
        }
        finally { gate.Release(); }
    }
}
