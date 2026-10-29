using Aqours.Domain.Features.SupplySites;

namespace Aqours.Domain.Features.Weather;

public sealed class WeatherSettings
{
    public const double DefaultHeatThresholdCelsius = 35;
    public int Id { get; private set; } = 1;
    public double HeatThresholdCelsius { get; private set; } = DefaultHeatThresholdCelsius;
    public DateTimeOffset? UpdatedAt { get; private set; }

    public static bool ValidThreshold(double value) => double.IsFinite(value) && value is >= 0 and <= 60;

    public void ChangeThreshold(double value, DateTimeOffset now)
    {
        if (!ValidThreshold(value)) throw new ArgumentOutOfRangeException(nameof(value));
        HeatThresholdCelsius = value;
        var utc = now.ToUniversalTime();
        UpdatedAt = utc.AddTicks(-(utc.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}

public sealed record ForecastTemperature(DateOnly Date, double? MaximumTemperatureCelsius);
public enum WeatherWarningState { Unknown, NoWarning, PotentialSupplyRisk }
public sealed record AssessedForecastDay(DateOnly Date, double? MaximumTemperatureCelsius, WeatherWarningState WarningState);
public sealed record RecommendedAction(string Code, string Instruction, string Reason);
public sealed record WeatherAssessment(IReadOnlyList<AssessedForecastDay> Days, bool SupplyMissing, bool SupplyStale,
    bool ForecastMissing, bool ForecastIncomplete, bool ForecastStale, bool IsProvisional,
    IReadOnlyList<string> Limitations, IReadOnlyList<RecommendedAction> RecommendedActions);

public static class WeatherRules
{
    public static readonly TimeSpan ForecastFreshness = TimeSpan.FromHours(1);
    public static readonly TimeSpan SupplyFreshness = TimeSpan.FromHours(24);

    // The MVP serves Philippine sites; UTC+08 has no daylight-saving transitions.
    public static DateOnly PhilippineDate(DateTimeOffset instant) => DateOnly.FromDateTime(instant.ToOffset(TimeSpan.FromHours(8)).DateTime);

    public static WeatherAssessment Assess(DateTimeOffset now, double threshold, SupplyStatus? supply,
        DateTimeOffset? supplyUpdatedAt, DateTimeOffset? forecastRetrievedAt, IReadOnlyList<ForecastTemperature> forecast)
    {
        var today = PhilippineDate(now);
        var supplyMissing = supply is null;
        var supplyStale = supplyUpdatedAt is { } updated && now - updated > SupplyFreshness;
        var days = Enumerable.Range(0, 3).Select(offset =>
        {
            var date = today.AddDays(offset);
            var value = forecast.FirstOrDefault(day => day.Date == date)?.MaximumTemperatureCelsius;
            if (value is { } number && !double.IsFinite(number)) value = null;
            var state = value is null || supplyMissing ? WeatherWarningState.Unknown
                : value > threshold && supply == SupplyStatus.Low ? WeatherWarningState.PotentialSupplyRisk
                : WeatherWarningState.NoWarning;
            return new AssessedForecastDay(date, value, state);
        }).ToList();
        var missing = days.All(day => day.MaximumTemperatureCelsius is null);
        var incomplete = days.Any(day => day.MaximumTemperatureCelsius is null);
        var stale = forecastRetrievedAt is { } fetched && now - fetched >= ForecastFreshness;
        var limitations = new List<string>();
        if (supplyMissing) limitations.Add("No supply reading is available; the supply-risk assessment is unknown.");
        if (supplyStale) limitations.Add("The latest supply reading is over 24 hours old and may not reflect current conditions.");
        if (incomplete) limitations.Add("Forecast temperatures are missing for one or more days; those assessments are unknown.");
        if (stale) limitations.Add("The forecast is at least one hour old; assessments using it are provisional.");
        var actions = new List<RecommendedAction>();
        if (days.Any(day => day.WarningState == WeatherWarningState.PotentialSupplyRisk))
            actions.Add(new("ReviewStockAndReplenishment", "Verify stock, prepare replenishment, and check delivery schedules.",
                "Forecast heat exceeds the demo threshold while the latest recorded supply is Low; this indicates potential supply risk."));
        if (supplyMissing || supplyStale)
            actions.Add(new("RecordFreshSupplyReading", "Record a fresh reading to confirm current conditions.",
                supplyMissing ? "No supply reading is available." : "The latest supply reading is over 24 hours old."));
        if (supply == SupplyStatus.Unavailable)
        {
            actions.Add(new("VerifyInterruptionAndArrangeSupply", "Verify the interruption and arrange replenishment or alternative supply.",
                "The latest recorded supply is Unavailable."));
            actions.Add(new("CommunicateConfirmedServiceChanges", "Confirm service availability and communicate verified changes to affected customers.",
                "The latest recorded supply is Unavailable; customer communications require verified service information."));
        }
        if (incomplete || stale)
            actions.Add(new("VerifyConditionsWithoutFreshForecast", "Check manual supply conditions; the weather assessment is incomplete.",
                stale ? "The forecast is stale." : "Forecast temperatures are missing or incomplete."));
        return new(days, supplyMissing, supplyStale, missing, incomplete, stale, stale, limitations, actions);
    }
}
