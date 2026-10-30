using System.Text.Json;
using Aqours.Application.Features.Weather;
using Aqours.Domain.Features.Weather;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Weather;

// Provider cache storage is an Infrastructure concern, separate from warning rules.
public sealed class WeatherForecastRecord
{
    public Guid SiteId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public DateOnly WindowStart { get; set; }
    public DateTimeOffset? RetrievedAt { get; set; }
    public DateTimeOffset? RetryAfter { get; set; }
    public string DaysJson { get; set; } = "[]";
}

public sealed class PostgresWeatherStore(IDbContextFactory<AqoursDbContext> contexts) : IWeatherStore
{
    public async Task<WeatherSettings> GetSettingsAsync(CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        return await db.WeatherSettings.AsNoTracking().SingleAsync(ct);
    }

    public async Task SaveSettingsAsync(WeatherSettings settings, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        db.WeatherSettings.Update(settings);
        await db.SaveChangesAsync(ct);
    }

    public async Task<ForecastCache?> GetForecastAsync(Guid siteId, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var record = await db.WeatherForecasts.AsNoTracking().SingleOrDefaultAsync(row => row.SiteId == siteId, ct);
        return record is null ? null : new(record.SiteId, record.Latitude, record.Longitude, record.WindowStart,
            record.RetrievedAt, record.RetryAfter, JsonSerializer.Deserialize<List<ForecastTemperature>>(record.DaysJson)!);
    }

    public async Task SaveForecastAsync(ForecastCache cache, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        // UPSERT also avoids insert races if a second API process writes a cache row.
        var days = JsonSerializer.Serialize(cache.Days);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO weather_forecasts (site_id, latitude, longitude, window_start, retrieved_at, retry_after, days_json)
            VALUES ({cache.SiteId}, {cache.Latitude}, {cache.Longitude}, {cache.WindowStart}, {cache.RetrievedAt}, {cache.RetryAfter}, {days})
            ON CONFLICT (site_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
                window_start = EXCLUDED.window_start, retrieved_at = EXCLUDED.retrieved_at,
                retry_after = EXCLUDED.retry_after, days_json = EXCLUDED.days_json
            """, ct);
    }
}
