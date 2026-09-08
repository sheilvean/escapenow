using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EscapeNow.Application.Abstractions;
using EscapeNow.Domain.Destinations;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace EscapeNow.IntegrationTests;

/// <summary>
/// Starts the real host through <see cref="WebApplicationFactory{TEntryPoint}"/> — the same
/// Program.cs, the same composition root, the same routing — and drives it over HTTP. A test that
/// only constructed the service classes would not prove the application boots.
///
/// The forecast port is replaced with an in-memory fake. Calling the real Open-Meteo API here
/// would fan out to twelve cities, put a network dependency into `check`, and make the stage slow
/// and flaky. The fake keeps this a test of the endpoints, the ranking and the HTTP contract —
/// which is what the layer above the weather client is actually responsible for.
/// </summary>
public sealed class DestinationEndpointsTests : IClassFixture<DestinationEndpointsTests.Host>
{
    private readonly Host _host;

    public DestinationEndpointsTests(Host host) => _host = host;

    [Fact]
    public async Task Recommendations_return_the_top_five_ranked_by_score_descending()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/recommendations",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);

        var results = body.EnumerateArray().ToList();

        // The catalog holds twelve cities and the service returns the best five.
        Assert.Equal(5, results.Count);

        var scores = results.Select(r => r.GetProperty("score").GetInt32()).ToList();
        Assert.Equal(scores.OrderByDescending(s => s).ToList(), scores);

        foreach (var result in results)
        {
            Assert.False(string.IsNullOrWhiteSpace(result.GetProperty("city").GetString()));
            Assert.False(string.IsNullOrWhiteSpace(result.GetProperty("country").GetString()));
            Assert.False(string.IsNullOrWhiteSpace(result.GetProperty("recommendation").GetString()));

            var score = result.GetProperty("score").GetInt32();
            Assert.InRange(score, 0, 100);
        }
    }

    [Fact]
    public async Task A_temperature_preference_is_accepted_and_still_ranks()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/recommendations?temperaturePreference=warm&weatherPreference=sunny",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);

        Assert.Equal(5, body.EnumerateArray().Count());
    }

    [Fact]
    public async Task An_unrecognised_preference_falls_back_rather_than_failing_the_request()
    {
        // The endpoint parses preferences leniently; an unknown value means "no preference".
        // That is observable behaviour a client relies on, so it is pinned here.
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/recommendations?temperaturePreference=tropical",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_known_city_returns_its_forecast_and_reasons()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/Lisbon",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);

        Assert.Equal("Lisbon", body.GetProperty("city").GetString());
        Assert.Equal("Portugal", body.GetProperty("country").GetString());
        Assert.InRange(body.GetProperty("score").GetInt32(), 0, 100);

        var forecast = body.GetProperty("forecast").EnumerateArray().ToList();
        Assert.Equal(FakeWeatherService.DayCount, forecast.Count);
        Assert.All(forecast, day =>
            Assert.False(string.IsNullOrWhiteSpace(day.GetProperty("condition").GetString())));

        Assert.NotEmpty(body.GetProperty("reasons").EnumerateArray());
    }

    [Fact]
    public async Task A_city_lookup_is_case_insensitive()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/lisbon",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_city_answers_404()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/Atlantis",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_route_answers_problem_details()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/no-such-route",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal(404, body.GetProperty("status").GetInt32());
        // The trace identifier makes a client-reported failure findable in the logs.
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Liveness_answers_while_the_process_is_up()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/health/live",
            TestContext.Current.CancellationToken);

        // A load balancer routes on the status code, so that is what is asserted.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Readiness_answers_once_the_process_has_started()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/health/ready",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>Host under test. Named rather than aliased so failures point somewhere obvious.</summary>
    public sealed class Host : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");

            // Replace the typed-HttpClient registration of the forecast port. RemoveAll drops
            // both the interface registration and the HttpClient plumbing bound to it, so no
            // request can reach the network from here.
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IWeatherService>();
                services.AddSingleton<IWeatherService, FakeWeatherService>();
            });
        }
    }

    /// <summary>
    /// Returns a deterministic forecast whose quality varies by longitude, so the ranking has
    /// something real to order. Hand-written rather than mocked: the port has one member.
    /// </summary>
    private sealed class FakeWeatherService : IWeatherService
    {
        internal const int DayCount = 7;

        public Task<IReadOnlyList<DailyWeatherSnapshot>> GetForecastAsync(
            WeatherForecastRequest request,
            CancellationToken cancellationToken = default)
        {
            // A southern, easterly city gets the better weather. This is arbitrary but stable,
            // which is what makes the descending-score assertion meaningful.
            var warmth = 14.0 + ((request.Latitude < 45 ? 8.0 : 0.0) + (request.Longitude / 10.0));

            var days = Enumerable.Range(0, DayCount)
                .Select(offset => new DailyWeatherSnapshot(
                    request.StartDate.AddDays(offset),
                    warmth - 4,
                    warmth + 4,
                    RainProbability: 10,
                    Condition: WeatherConditionKind.Sunny))
                .ToList();

            return Task.FromResult<IReadOnlyList<DailyWeatherSnapshot>>(days);
        }
    }
}
