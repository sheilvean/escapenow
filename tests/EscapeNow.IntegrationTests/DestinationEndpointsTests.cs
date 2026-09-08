using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EscapeNow.Infrastructure.Persistence;

namespace EscapeNow.IntegrationTests;

[Collection("api")]
public sealed class DestinationEndpointsTests
{
    private readonly ApiTestHost _host;

    public DestinationEndpointsTests(ApiTestHost host) => _host = host;

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

        Assert.Equal(5, results.Count);

        var scores = results.Select(r => r.GetProperty("score").GetInt32()).ToList();
        Assert.Equal(scores.OrderByDescending(s => s).ToList(), scores);

        foreach (var result in results)
        {
            Assert.False(result.GetProperty("id").GetGuid() == Guid.Empty);
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
            $"/api/destinations/{CityCatalogSeedIds.Lisbon}",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);

        Assert.Equal(CityCatalogSeedIds.Lisbon, body.GetProperty("id").GetGuid());
        Assert.Equal("Lisbon", body.GetProperty("city").GetString());
        Assert.Equal("Portugal", body.GetProperty("country").GetString());
        Assert.InRange(body.GetProperty("score").GetInt32(), 0, 100);

        var forecast = body.GetProperty("forecast").EnumerateArray().ToList();
        Assert.Equal(ApiTestHost.FakeWeatherService.DayCount, forecast.Count);
        Assert.All(forecast, day =>
            Assert.False(string.IsNullOrWhiteSpace(day.GetProperty("condition").GetString())));

        Assert.NotEmpty(body.GetProperty("reasons").EnumerateArray());
    }

    [Fact]
    public async Task A_city_name_is_not_a_destination_identifier()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/api/destinations/Lisbon",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_city_answers_404()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            $"/api/destinations/{Guid.Parse("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")}",
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
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Liveness_answers_while_the_process_is_up()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/health/live",
            TestContext.Current.CancellationToken);

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
}
