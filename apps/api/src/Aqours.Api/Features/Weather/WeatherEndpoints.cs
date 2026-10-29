using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Api.Features.SupplySites;
using Aqours.Application.Features.Weather;
using Aqours.Domain.Features.Weather;

namespace Aqours.Api.Features.Weather;

public sealed record ChangeWeatherSettingsRequest(JsonElement HeatThresholdCelsius)
{
    public double? ThresholdValue => HeatThresholdCelsius.ValueKind == JsonValueKind.Number && HeatThresholdCelsius.TryGetDouble(out var value) ? value : null;
}
public sealed record WeatherSettingsResponse(double HeatThresholdCelsius, DateTimeOffset? UpdatedAt)
{
    public static WeatherSettingsResponse From(WeatherSettings settings) => new(settings.HeatThresholdCelsius, settings.UpdatedAt);
}
public sealed record ForecastDayResponse(DateOnly Date, double? MaximumTemperatureCelsius, string WarningState);
public sealed record RecommendedActionResponse(string Code, string Instruction, string Reason);
public sealed record WeatherProviderResponse(string Name, string Attribution, string Url);
public sealed record SiteWeatherResponse(Guid Id, string Name, double Latitude, double Longitude, double HeatThresholdCelsius,
    string? LatestSupplyStatus, DateTimeOffset? LatestSupplyAt, bool SupplyMissing, bool SupplyStale,
    DateTimeOffset? ForecastRetrievedAt, DateTimeOffset? ForecastRetryAfter, bool ForecastMissing, bool ForecastIncomplete,
    bool ForecastStale, bool IsProvisional, WeatherProviderResponse Provider, IReadOnlyList<ForecastDayResponse> Days,
    IReadOnlyList<string> Limitations, IReadOnlyList<RecommendedActionResponse> RecommendedActions)
{
    public static SiteWeatherResponse From(SiteWeather weather)
    {
        var site = weather.Site.Site;
        var assessment = weather.Assessment;
        return new(site.Id, site.Name, site.Latitude, site.Longitude, weather.HeatThresholdCelsius,
            weather.Site.LatestSupply?.Status.ToString(), weather.Site.LatestSupply?.UpdatedAt, assessment.SupplyMissing, assessment.SupplyStale,
            weather.Forecast.RetrievedAt, weather.Forecast.RetryAfter, assessment.ForecastMissing, assessment.ForecastIncomplete,
            assessment.ForecastStale, assessment.IsProvisional, new("Open-Meteo", "Weather data by Open-Meteo.com (CC BY 4.0)", "https://open-meteo.com/"),
            assessment.Days.Select(day => new ForecastDayResponse(day.Date, day.MaximumTemperatureCelsius, day.WarningState.ToString())).ToList(),
            assessment.Limitations, assessment.RecommendedActions.Select(action => new RecommendedActionResponse(action.Code, action.Instruction, action.Reason)).ToList());
    }
}
public sealed record SiteWeatherPageResponse(IReadOnlyList<SiteWeatherResponse> Items, int Page, int PageSize, int TotalCount);

public static class WeatherEndpoints
{
    public static void MapWeatherEndpoints(this WebApplication app)
    {
        var weather = app.MapGroup("/api/staff/weather").RequireAuthorization("Personnel");
        weather.MapGet("/settings", async (WeatherService service, CancellationToken ct) =>
            Results.Ok(WeatherSettingsResponse.From(await service.SettingsAsync(ct))));
        app.MapPut("/api/admin/weather/settings", async (ChangeWeatherSettingsRequest request, WeatherService service, CancellationToken ct) =>
        {
            var result = await service.ChangeSettingsAsync(request.ThresholdValue, ct);
            return result.Errors is not null ? Results.ValidationProblem(result.Errors)
                : Results.Ok(WeatherSettingsResponse.From(result.Value!));
        }).RequireAuthorization("Admin").AddEndpointFilter<CsrfFilter>();
        app.MapGet("/api/staff/supply-sites/{id:guid}/weather", async (Guid id, WeatherService service, CancellationToken ct) =>
        {
            var result = await service.FindAsync(id, ct);
            return result is null ? Results.NotFound() : Results.Ok(SiteWeatherResponse.From(result));
        }).RequireAuthorization("Personnel");
        weather.MapGet("/sites", async (WeatherService service, CancellationToken ct, string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var number = SupplySiteEndpoints.ParsePagination(page, 1, "page", errors);
            var size = SupplySiteEndpoints.ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.ListAsync(number, size, ct);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            var value = result.Value!;
            return Results.Ok(new SiteWeatherPageResponse(value.Items.Select(SiteWeatherResponse.From).ToList(), value.Page, value.PageSize, value.TotalCount));
        });
    }
}
