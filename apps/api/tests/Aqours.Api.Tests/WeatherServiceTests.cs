using Aqours.Application.Features.SupplySites;
using Aqours.Application.Features.Weather;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Features.Weather;
using Aqours.Domain.Locations;

namespace Aqours.Api.Tests;

public sealed class WeatherServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(-0.01)]
    [InlineData(60.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public async Task Threshold_outside_valid_range_is_rejected(double threshold)
    {
        var service = CreateService(new MemoryWeatherStore(), new MutableSupplyStore(CreateSite()));

        var result = await service.ChangeSettingsAsync(threshold);

        Assert.False(result.Succeeded);
        Assert.Contains("heatThresholdCelsius", result.Errors!.Keys);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(60)]
    public async Task Threshold_endpoints_are_accepted_and_persisted(double threshold)
    {
        var store = new MemoryWeatherStore();
        var service = CreateService(store, new MutableSupplyStore(CreateSite()));

        var result = await service.ChangeSettingsAsync(threshold);

        Assert.Equal(threshold, result.Value!.HeatThresholdCelsius);
        Assert.Equal(threshold, store.Settings.HeatThresholdCelsius);
        Assert.Equal(Now, store.Settings.UpdatedAt);
    }

    [Fact]
    public async Task Concurrent_requests_for_same_site_share_one_forecast_fetch()
    {
        var site = CreateSite();
        var store = new MemoryWeatherStore();
        var sites = new MutableSupplyStore(site);
        var calls = 0;
        var provider = new FakeProvider(async (latitude, longitude, today, ct) =>
        {
            Interlocked.Increment(ref calls);
            await Task.Delay(30, ct);
            return HotForecast(today);
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var service = CreateService(store, sites, provider, coordinator);

        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => service.FindAsync(site.Site.Id)));

        Assert.All(results, result => Assert.NotNull(result));
        Assert.Equal(1, calls);
        Assert.Equal(1, store.Saves);
        Assert.All(results, result => Assert.Equal(WeatherWarningState.PotentialSupplyRisk, result!.Assessment.Days[0].WarningState));
    }

    [Fact]
    public async Task Provider_failure_sets_cooldown_and_a_retry_during_cooldown_uses_cache()
    {
        var site = CreateSite();
        var store = new MemoryWeatherStore();
        var calls = 0;
        var provider = new FakeProvider((_, _, _, _) =>
        {
            Interlocked.Increment(ref calls);
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(null);
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var clock = new MutableTimeProvider(Now);
        var service = CreateService(store, new MutableSupplyStore(site), provider, coordinator, clock);

        var first = await service.FindAsync(site.Site.Id);
        clock.Advance(TimeSpan.FromMinutes(4));
        var second = await service.FindAsync(site.Site.Id);

        Assert.Equal(1, calls);
        Assert.NotNull(store.Cache);
        Assert.Equal(Now.AddMinutes(5), store.Cache.RetryAfter);
        Assert.Null(store.Cache.RetrievedAt);
        Assert.True(first!.Assessment.ForecastMissing);
        Assert.True(second!.Assessment.ForecastMissing);
    }

    [Fact]
    public async Task Expired_retry_cooldown_retries_provider()
    {
        var site = CreateSite();
        var store = new MemoryWeatherStore();
        var calls = 0;
        var provider = new FakeProvider((_, _, today, _) =>
        {
            calls++;
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(calls == 1 ? null : HotForecast(today));
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var clock = new MutableTimeProvider(Now);
        var service = CreateService(store, new MutableSupplyStore(site), provider, coordinator, clock);

        await service.FindAsync(site.Site.Id);
        clock.Advance(TimeSpan.FromMinutes(5));
        var result = await service.FindAsync(site.Site.Id);

        Assert.Equal(2, calls);
        Assert.Equal(WeatherWarningState.PotentialSupplyRisk, result!.Assessment.Days[0].WarningState);
        Assert.Null(store.Cache!.RetryAfter);
    }

    [Fact]
    public async Task Coordinate_change_discards_site_cache_and_fetches_new_coordinates()
    {
        var site = CreateSite();
        var sites = new MutableSupplyStore(site);
        var store = new MemoryWeatherStore();
        var coordinates = new List<(double Latitude, double Longitude)>();
        var provider = new FakeProvider((latitude, longitude, today, _) =>
        {
            coordinates.Add((latitude, longitude));
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(HotForecast(today));
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var service = CreateService(store, sites, provider, coordinator);

        await service.FindAsync(site.Site.Id);
        site.Site.Replace(site.Site.Name, site.Site.Address, 15.25, 121.75, Now.AddMinutes(1));
        await service.FindAsync(site.Site.Id);

        Assert.Equal(new[] { (14.5, 120.9), (15.25, 121.75) }, coordinates);
        Assert.Equal(15.25, store.Cache!.Latitude);
        Assert.Equal(121.75, store.Cache.Longitude);
    }

    [Fact]
    public async Task Fresh_same_day_cache_does_not_call_provider_again()
    {
        var site = CreateSite();
        var store = new MemoryWeatherStore();
        var calls = 0;
        var provider = new FakeProvider((_, _, today, _) =>
        {
            calls++;
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(HotForecast(today));
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var service = CreateService(store, new MutableSupplyStore(site), provider, coordinator);

        await service.FindAsync(site.Site.Id);
        await service.FindAsync(site.Site.Id);

        Assert.Equal(1, calls);
        Assert.Equal(1, store.Saves);
    }

    [Fact]
    public async Task Assessment_uses_latest_supply_reading_after_provider_wait()
    {
        var site = CreateSite();
        var sites = new MutableSupplyStore(site);
        var store = new MemoryWeatherStore();
        using var coordinator = new WeatherRefreshCoordinator();
        var provider = new FakeProvider((_, _, today, _) =>
        {
            sites.ReplaceSite(new(site.Site, new SupplyUpdate(site.Site.Id, SupplyStatus.Normal, "staff", "Test Staff", Now)));
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(HotForecast(today));
        });
        var service = CreateService(store, sites, provider, coordinator);

        var result = await service.FindAsync(site.Site.Id);

        Assert.Equal(WeatherWarningState.NoWarning, result!.Assessment.Days[0].WarningState);
        Assert.Equal(SupplyStatus.Normal, result.Site.LatestSupply!.Status);
    }

    [Fact]
    public async Task A_new_Manila_day_refreshes_even_when_last_forecast_is_under_one_hour_old()
    {
        var site = CreateSite();
        var store = new MemoryWeatherStore();
        var calls = 0;
        var provider = new FakeProvider((_, _, today, _) =>
        {
            calls++;
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(HotForecast(today));
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var clock = new MutableTimeProvider(new DateTimeOffset(2026, 10, 29, 15, 30, 0, TimeSpan.Zero));
        var service = CreateService(store, new MutableSupplyStore(site), provider, coordinator, clock);

        await service.FindAsync(site.Site.Id);
        clock.Advance(TimeSpan.FromMinutes(31)); // Manila midnight, while the first cache is only 31 minutes old.
        await service.FindAsync(site.Site.Id);

        Assert.Equal(2, calls);
        Assert.Equal(new DateOnly(2026, 10, 30), store.Cache!.WindowStart);
    }

    [Fact]
    public async Task Forecast_exactly_one_hour_old_is_refreshed()
    {
        var site = CreateSite();
        var store = new MemoryWeatherStore();
        var calls = 0;
        store.Seed(new(site.Site.Id, site.Site.Latitude, site.Site.Longitude,
            new DateOnly(2026, 10, 29), Now.AddHours(-1), null, HotForecast(new DateOnly(2026, 10, 29))));
        var provider = new FakeProvider((_, _, today, _) =>
        {
            calls++;
            return Task.FromResult<IReadOnlyList<ForecastTemperature>?>(HotForecast(today));
        });
        using var coordinator = new WeatherRefreshCoordinator();
        var service = CreateService(store, new MutableSupplyStore(site), provider, coordinator);

        await service.FindAsync(site.Site.Id);

        Assert.Equal(1, calls);
        Assert.Equal(Now, store.Cache!.RetrievedAt);
    }

    [Fact]
    public async Task Shared_coordinator_caps_parallel_fetches_at_four_across_service_instances()
    {
        const int siteCount = 8;
        var coordinator = new WeatherRefreshCoordinator();
        var active = 0;
        var maximumActive = 0;
        var calls = 0;
        var startedFour = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var provider = new FakeProvider(async (_, _, today, ct) =>
        {
            Interlocked.Increment(ref calls);
            var current = Interlocked.Increment(ref active);
            UpdateMaximum(ref maximumActive, current);
            if (current == 4) startedFour.TrySetResult();
            await release.Task.WaitAsync(ct);
            Interlocked.Decrement(ref active);
            return HotForecast(today);
        });
        var selectedSites = new List<MonitoredSupplySite>();
        foreach (var candidate in Enumerable.Range(0, 100).Select(_ => CreateSite()))
        {
            if (selectedSites.Any(selected => ReferenceEquals(coordinator.SiteLock(selected.Site.Id), coordinator.SiteLock(candidate.Site.Id))))
                continue;
            selectedSites.Add(candidate);
            if (selectedSites.Count == siteCount) break;
        }
        Assert.Equal(siteCount, selectedSites.Count);
        var services = selectedSites.Select(site =>
            (site, service: CreateService(new MemoryWeatherStore(), new MutableSupplyStore(site), provider, coordinator))).ToArray();
        try
        {
            var requests = services.Select(pair => pair.service.FindAsync(pair.site.Site.Id)).ToArray();
            await startedFour.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Equal(4, Volatile.Read(ref maximumActive));
            release.TrySetResult();
            await Task.WhenAll(requests);
            Assert.Equal(siteCount, calls);
            Assert.Equal(4, maximumActive);
        }
        finally
        {
            release.TrySetResult();
            coordinator.Dispose();
        }
    }

    private static void UpdateMaximum(ref int maximum, int candidate)
    {
        var current = Volatile.Read(ref maximum);
        while (candidate > current)
        {
            var observed = Interlocked.CompareExchange(ref maximum, candidate, current);
            if (observed == current) return;
            current = observed;
        }
    }

    private static WeatherService CreateService(MemoryWeatherStore store, MutableSupplyStore sites,
        FakeProvider? provider = null, WeatherRefreshCoordinator? coordinator = null, TimeProvider? clock = null) =>
        new(store, sites, provider ?? new FakeProvider((_, _, today, _) => Task.FromResult<IReadOnlyList<ForecastTemperature>?>(HotForecast(today))),
            coordinator ?? new WeatherRefreshCoordinator(), clock ?? new MutableTimeProvider(Now));

    private static IReadOnlyList<ForecastTemperature> HotForecast(DateOnly today) =>
        [new(today, 36), new(today.AddDays(1), 37), new(today.AddDays(2), 38)];

    private static MonitoredSupplySite CreateSite(double latitude = 14.5, double longitude = 120.9)
    {
        var site = new SupplySite("Test supply site", new PsgcAddress("01", "Region", "0101", "Province",
            "010101", "Municipality", null, null, "010101001", "Barangay", "Main road"),
            latitude, longitude, Now);
        return new(site, new SupplyUpdate(site.Id, SupplyStatus.Low, "staff", "Test Staff", Now));
    }

    private sealed class MemoryWeatherStore : IWeatherStore
    {
        public WeatherSettings Settings { get; } = new();
        public ForecastCache? Cache { get; private set; }
        public int Saves { get; private set; }
        public void Seed(ForecastCache cache) => Cache = cache;
        public Task<WeatherSettings> GetSettingsAsync(CancellationToken ct) => Task.FromResult(Settings);
        public Task SaveSettingsAsync(WeatherSettings settings, CancellationToken ct) => Task.CompletedTask;
        public Task<ForecastCache?> GetForecastAsync(Guid siteId, CancellationToken ct) =>
            Task.FromResult(Cache?.SiteId == siteId ? Cache : null);
        public Task SaveForecastAsync(ForecastCache cache, CancellationToken ct)
        {
            Cache = cache;
            Saves++;
            return Task.CompletedTask;
        }
    }

    private sealed class MutableSupplyStore(MonitoredSupplySite site) : ISupplyMonitoringStore
    {
        private MonitoredSupplySite _site = site;
        public void ReplaceSite(MonitoredSupplySite replacement) => _site = replacement;
        public Task<bool> SiteExistsAsync(Guid id, CancellationToken cancellationToken) => Task.FromResult(_site.Site.Id == id);
        public Task<MonitoredSupplySite?> FindAsync(Guid id, CancellationToken cancellationToken) =>
            Task.FromResult<MonitoredSupplySite?>(_site.Site.Id == id ? _site : null);
        public Task<MonitoredSupplySitePage> ListAsync(int page, int pageSize, CancellationToken cancellationToken) =>
            Task.FromResult(new MonitoredSupplySitePage([_site], page, pageSize, 1));
        public Task AddAsync(SupplyUpdate update, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<SupplyUpdatePage> HistoryAsync(Guid siteId, int page, int pageSize, CancellationToken cancellationToken) =>
            Task.FromResult(new SupplyUpdatePage([], page, pageSize, 0));
    }

    private sealed class FakeProvider(Func<double, double, DateOnly, CancellationToken, Task<IReadOnlyList<ForecastTemperature>?>> fetch)
        : IWeatherForecastProvider
    {
        public Task<IReadOnlyList<ForecastTemperature>?> FetchAsync(double latitude, double longitude, DateOnly today, CancellationToken ct) =>
            fetch(latitude, longitude, today, ct);
    }

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan duration) => _now += duration;
    }
}
