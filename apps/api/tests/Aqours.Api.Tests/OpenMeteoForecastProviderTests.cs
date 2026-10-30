using System.Net;
using Aqours.Domain.Features.Weather;
using Aqours.Infrastructure.Features.Weather;
using Microsoft.Extensions.Logging.Abstractions;

namespace Aqours.Api.Tests;

public sealed class OpenMeteoForecastProviderTests
{
    private static readonly DateOnly Today = new(2026, 10, 29);

    [Fact]
    public async Task Fetch_requests_three_Celsius_days_in_Manila_and_returns_three_day_window()
    {
        Uri? requestedUri = null;
        using var http = new HttpClient(new StubHandler((request, _) =>
        {
            requestedUri = request.RequestUri;
            return Task.FromResult(JsonResponse("""
                {"timezone":"Asia/Manila","daily_units":{"temperature_2m_max":"°C"},"daily":{"time":["2026-10-29","2026-10-30","2026-10-31"],"temperature_2m_max":[34.5,35,36]}}
                """));
        }));
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);

        var forecast = await provider.FetchAsync(14.5995, 120.9842, Today, CancellationToken.None);

        Assert.NotNull(requestedUri);
        Assert.Equal("api.open-meteo.com", requestedUri!.Host);
        Assert.Contains("latitude=14.5995", requestedUri.Query, StringComparison.Ordinal);
        Assert.Contains("longitude=120.9842", requestedUri.Query, StringComparison.Ordinal);
        Assert.Contains("daily=temperature_2m_max", requestedUri.Query, StringComparison.Ordinal);
        Assert.Contains("forecast_days=3", requestedUri.Query, StringComparison.Ordinal);
        Assert.Contains("temperature_unit=celsius", requestedUri.Query, StringComparison.Ordinal);
        Assert.Contains("timezone=Asia%2FManila", requestedUri.Query, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(new double?[] { 34.5, 35d, 36d }, forecast!.Select(day => day.MaximumTemperatureCelsius));
        Assert.Equal(new[] { Today, Today.AddDays(1), Today.AddDays(2) }, forecast!.Select(day => day.Date));
    }

    [Fact]
    public async Task Fetch_fills_missing_forecast_days_with_null_temperature()
    {
        using var http = JsonHttp("""
            {"timezone":"Asia/Manila","daily_units":{"temperature_2m_max":"°C"},"daily":{"time":["2026-10-30"],"temperature_2m_max":[36.25]}}
            """);
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);

        var forecast = await provider.FetchAsync(14, 120, Today, CancellationToken.None);

        Assert.Equal(new double?[] { null, 36.25, null }, forecast!.Select(day => day.MaximumTemperatureCelsius));
    }

    [Theory]
    [InlineData("{\"timezone\":\"UTC\",\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-10-29\"],\"temperature_2m_max\":[38]}}")]
    [InlineData("{\"timezone\":8,\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-10-29\"],\"temperature_2m_max\":[38]}}")]
    [InlineData("{\"timezone\":\"Asia/Manila\",\"daily_units\":{\"temperature_2m_max\":\"°F\"},\"daily\":{\"time\":[\"2026-10-29\"],\"temperature_2m_max\":[38]}}")]
    [InlineData("{\"timezone\":\"Asia/Manila\",\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-10-29\"],\"temperature_2m_max\":[\"hot\"]}}")]
    [InlineData("{\"timezone\":\"Asia/Manila\",\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-10-29\",\"2026-10-30\"],\"temperature_2m_max\":[38]}}")]
    [InlineData("{\"timezone\":\"Asia/Manila\",\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-10-29\",\"2026-10-29\"],\"temperature_2m_max\":[38,39]}}")]
    [InlineData("{\"timezone\":\"Asia/Manila\",\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-10-28\"],\"temperature_2m_max\":[38]}}")]
    [InlineData("{\"timezone\":\"Asia/Manila\",\"daily_units\":{\"temperature_2m_max\":\"°C\"},\"daily\":{\"time\":[\"2026-11-01\"],\"temperature_2m_max\":[38]}}")]
    [InlineData("{not-json")]
    public async Task Fetch_rejects_malformed_or_incompatible_payloads(string body)
    {
        using var http = JsonHttp(body);
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);

        Assert.Null(await provider.FetchAsync(14, 120, Today, CancellationToken.None));
    }

    [Fact]
    public async Task Fetch_returns_null_when_provider_returns_http_error()
    {
        using var http = new HttpClient(new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))));
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);

        Assert.Null(await provider.FetchAsync(14, 120, Today, CancellationToken.None));
    }

    [Fact]
    public async Task Fetch_returns_null_when_provider_rate_limits_request()
    {
        using var http = new HttpClient(new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.TooManyRequests))));
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);

        Assert.Null(await provider.FetchAsync(14, 120, Today, CancellationToken.None));
    }

    [Fact]
    public async Task Fetch_returns_null_when_http_request_times_out()
    {
        using var http = new HttpClient(new StubHandler(async (_, ct) =>
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, ct);
            return JsonResponse("{}");
        }))
        { Timeout = TimeSpan.FromMilliseconds(10) };
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);

        Assert.Null(await provider.FetchAsync(14, 120, Today, CancellationToken.None));
    }

    [Fact]
    public async Task Fetch_propagates_caller_cancellation()
    {
        using var http = new HttpClient(new StubHandler(async (_, ct) =>
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, ct);
            return JsonResponse("{}");
        }));
        var provider = new OpenMeteoForecastProvider(http, NullLogger<OpenMeteoForecastProvider>.Instance);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => provider.FetchAsync(14, 120, Today, cancellation.Token));
    }

    private static HttpClient JsonHttp(string json) => new(new StubHandler((_, _) => Task.FromResult(JsonResponse(json))));

    private static HttpResponseMessage JsonResponse(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
    };

    private sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            send(request, cancellationToken);
    }
}
