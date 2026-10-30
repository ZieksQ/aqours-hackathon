using System.Globalization;
using System.Text.Json;
using Aqours.Application.Features.Weather;
using Aqours.Domain.Features.Weather;
using Microsoft.Extensions.Logging;

namespace Aqours.Infrastructure.Features.Weather;

public sealed class OpenMeteoForecastProvider(HttpClient http, ILogger<OpenMeteoForecastProvider> logger) : IWeatherForecastProvider, IDisposable
{
    public async Task<IReadOnlyList<ForecastTemperature>?> FetchAsync(double latitude, double longitude, DateOnly today, CancellationToken ct)
    {
        var url = FormattableString.Invariant($"https://api.open-meteo.com/v1/forecast?latitude={latitude:R}&longitude={longitude:R}&daily=temperature_2m_max&forecast_days=3&temperature_unit=celsius&timezone=Asia%2FManila");
        try
        {
            using var response = await http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            return Parse(json.RootElement, today);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException || ex is OperationCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Open-Meteo forecast retrieval failed; returning an incomplete or cached assessment.");
            return null;
        }
    }

    public void Dispose() => http.Dispose();

    private static IReadOnlyList<ForecastTemperature>? Parse(JsonElement root, DateOnly today)
    {
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("timezone", out var zone) || zone.ValueKind != JsonValueKind.String || zone.GetString() != "Asia/Manila" ||
            !root.TryGetProperty("daily_units", out var units) || units.ValueKind != JsonValueKind.Object ||
            !units.TryGetProperty("temperature_2m_max", out var unit) || unit.ValueKind != JsonValueKind.String || unit.GetString() != "°C" ||
            !root.TryGetProperty("daily", out var daily) || daily.ValueKind != JsonValueKind.Object ||
            !daily.TryGetProperty("time", out var dates) || dates.ValueKind != JsonValueKind.Array ||
            !daily.TryGetProperty("temperature_2m_max", out var temperatures) || temperatures.ValueKind != JsonValueKind.Array ||
            dates.GetArrayLength() != temperatures.GetArrayLength() || dates.GetArrayLength() is < 1 or > 3) return null;
        var values = new Dictionary<DateOnly, double?>();
        for (var i = 0; i < dates.GetArrayLength(); i++)
        {
            if (dates[i].ValueKind != JsonValueKind.String ||
                !DateOnly.TryParseExact(dates[i].GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                date < today || date > today.AddDays(2) || values.ContainsKey(date)) return null;
            double? value = null;
            if (temperatures[i].ValueKind != JsonValueKind.Null)
            {
                if (temperatures[i].ValueKind != JsonValueKind.Number || !temperatures[i].TryGetDouble(out var number) || !double.IsFinite(number)) return null;
                value = number;
            }
            values.Add(date, value);
        }
        if (values.Values.All(value => value is null)) return null;
        return Enumerable.Range(0, 3).Select(offset => new ForecastTemperature(today.AddDays(offset), values.GetValueOrDefault(today.AddDays(offset)))).ToList();
    }
}
