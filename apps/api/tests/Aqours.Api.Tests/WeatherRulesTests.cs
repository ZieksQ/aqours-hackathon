using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Features.Weather;

namespace Aqours.Api.Tests;

public sealed class WeatherRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 29);

    [Fact]
    public void Philippine_date_and_assessment_window_use_Manila_calendar_days()
    {
        var beforeManilaMidnight = new DateTimeOffset(2026, 10, 28, 15, 59, 0, TimeSpan.Zero);
        var afterManilaMidnight = beforeManilaMidnight.AddMinutes(2);

        Assert.Equal(new DateOnly(2026, 10, 28), WeatherRules.PhilippineDate(beforeManilaMidnight));
        Assert.Equal(new DateOnly(2026, 10, 29), WeatherRules.PhilippineDate(afterManilaMidnight));

        var assessment = WeatherRules.Assess(Now, 35, SupplyStatus.Low, Now,
            Now.AddMinutes(-10), [new(Today, 34), new(Today.AddDays(1), 35), new(Today.AddDays(2), 36)]);

        Assert.Equal(new[] { Today, Today.AddDays(1), Today.AddDays(2) }, assessment.Days.Select(day => day.Date));
        Assert.Equal(new[] { WeatherWarningState.NoWarning, WeatherWarningState.NoWarning, WeatherWarningState.PotentialSupplyRisk },
            assessment.Days.Select(day => day.WarningState));
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "ReviewStockAndReplenishment");
    }

    [Theory]
    [InlineData(SupplyStatus.Normal, WeatherWarningState.NoWarning)]
    [InlineData(SupplyStatus.Unavailable, WeatherWarningState.NoWarning)]
    [InlineData(SupplyStatus.Low, WeatherWarningState.PotentialSupplyRisk)]
    public void Heat_warning_requires_temperature_strictly_above_threshold_and_low_supply(
        SupplyStatus supply, WeatherWarningState expected)
    {
        var assessment = WeatherRules.Assess(Now, 35, supply, Now,
            Now.AddMinutes(-1), [new(Today, 35.01)]);

        Assert.Equal(expected, assessment.Days[0].WarningState);
    }

    [Fact]
    public void Missing_supply_and_temperatures_are_unknown_and_actions_reflect_missing_data()
    {
        var assessment = WeatherRules.Assess(Now, 35, null, null,
            Now.AddMinutes(-1), [new(Today, 40), new(Today.AddDays(1), null)]);

        Assert.True(assessment.SupplyMissing);
        Assert.True(assessment.ForecastIncomplete);
        Assert.False(assessment.ForecastMissing);
        Assert.All(assessment.Days, day => Assert.Equal(WeatherWarningState.Unknown, day.WarningState));
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "RecordFreshSupplyReading");
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "VerifyConditionsWithoutFreshForecast");
        Assert.Contains(assessment.Limitations, limitation => limitation.Contains("No supply reading", StringComparison.Ordinal));
    }

    [Fact]
    public void Fully_missing_forecast_is_unknown_for_all_days()
    {
        var assessment = WeatherRules.Assess(Now, 35, SupplyStatus.Low, Now,
            Now.AddMinutes(-1), []);

        Assert.True(assessment.ForecastMissing);
        Assert.True(assessment.ForecastIncomplete);
        Assert.All(assessment.Days, day => Assert.Equal(WeatherWarningState.Unknown, day.WarningState));
    }

    [Fact]
    public void Forecast_staleness_at_one_hour_makes_assessment_provisional_but_keeps_rule_result()
    {
        var assessment = WeatherRules.Assess(Now, 35, SupplyStatus.Low, Now,
            Now.AddHours(-1), [new(Today, 40)]);

        Assert.True(assessment.ForecastStale);
        Assert.True(assessment.IsProvisional);
        Assert.Equal(WeatherWarningState.PotentialSupplyRisk, assessment.Days[0].WarningState);
        Assert.Contains(assessment.Limitations, limitation => limitation.Contains("at least one hour", StringComparison.Ordinal));
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "VerifyConditionsWithoutFreshForecast");
    }

    [Fact]
    public void Stale_low_supply_still_triggers_heat_rule_and_one_action_for_multiple_affected_days()
    {
        var assessment = WeatherRules.Assess(Now, 35, SupplyStatus.Low, Now.AddHours(-25),
            Now.AddMinutes(-1), [new(Today, 37), new(Today.AddDays(1), 38), new(Today.AddDays(2), 36)]);

        Assert.True(assessment.SupplyStale);
        Assert.Equal(3, assessment.Days.Count(day => day.WarningState == WeatherWarningState.PotentialSupplyRisk));
        Assert.Single(assessment.RecommendedActions, action => action.Code == "ReviewStockAndReplenishment");
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "RecordFreshSupplyReading");
    }

    [Fact]
    public void Unavailable_stale_supply_and_missing_forecast_combine_their_actions()
    {
        var assessment = WeatherRules.Assess(Now, 35, SupplyStatus.Unavailable, Now.AddHours(-25),
            null, []);

        Assert.True(assessment.SupplyStale);
        Assert.True(assessment.ForecastMissing);
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "RecordFreshSupplyReading");
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "VerifyInterruptionAndArrangeSupply");
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "CommunicateConfirmedServiceChanges");
        Assert.Contains(assessment.RecommendedActions, action => action.Code == "VerifyConditionsWithoutFreshForecast");
    }

    [Fact]
    public void Supply_staleness_is_strictly_over_24_hours_and_unavailable_suggests_verification_and_communication()
    {
        var exactlyFresh = WeatherRules.Assess(Now, 35, SupplyStatus.Unavailable, Now.AddHours(-24),
            Now.AddMinutes(-1), [new(Today, 40)]);
        var stale = WeatherRules.Assess(Now, 35, SupplyStatus.Unavailable, Now.AddHours(-24).AddTicks(-1),
            Now.AddMinutes(-1), [new(Today, 40)]);

        Assert.False(exactlyFresh.SupplyStale);
        Assert.Equal(WeatherWarningState.NoWarning, exactlyFresh.Days[0].WarningState);
        Assert.True(stale.SupplyStale);
        Assert.Contains(stale.RecommendedActions, action => action.Code == "RecordFreshSupplyReading");
        Assert.Contains(stale.RecommendedActions, action => action.Code == "VerifyInterruptionAndArrangeSupply");
        Assert.Contains(stale.RecommendedActions, action => action.Code == "CommunicateConfirmedServiceChanges");
    }

    [Fact]
    public void Non_finite_temperature_is_treated_as_missing()
    {
        var assessment = WeatherRules.Assess(Now, 35, SupplyStatus.Low, Now,
            Now.AddMinutes(-1), [new(Today, double.NaN)]);

        Assert.Null(assessment.Days[0].MaximumTemperatureCelsius);
        Assert.Equal(WeatherWarningState.Unknown, assessment.Days[0].WarningState);
    }
}
