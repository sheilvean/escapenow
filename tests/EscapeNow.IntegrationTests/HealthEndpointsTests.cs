using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace EscapeNow.IntegrationTests;

/// <summary>
/// Starts the real host through <see cref="WebApplicationFactory{TEntryPoint}"/> — the same
/// Program.cs, the same configuration binding, the same composition root — and drives it over
/// HTTP. A test that only constructed the service classes would not prove the application boots.
/// </summary>
public sealed class HealthEndpointsTests : IClassFixture<HealthEndpointsTests.Host>
{
    private readonly Host _host;

    public HealthEndpointsTests(Host host) => _host = host;

    [Fact]
    public async Task Liveness_answers_while_the_process_is_up()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/health/live",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal("alive", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Readiness_reports_ready_with_the_default_configuration()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync(
            "/health/ready",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal("Ready", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Readiness_answers_503_while_warming_up()
    {
        // Proves the status code follows the verdict: a load balancer reads the code, not the body.
        using var warming = _host.WithConfiguration(new Dictionary<string, string?>
        {
            ["Readiness:WarmupPeriod"] = "99:00:00",
        });
        using var client = warming.CreateClient();

        using var response = await client.GetAsync(
            "/health/ready",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal("Warming", body.GetProperty("status").GetString());
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
    public void A_negative_warmup_period_fails_startup_instead_of_the_first_request()
    {
        // ValidateOnStart turns a bad configuration value into a failed deployment rather
        // than a runtime surprise on whichever request happens to hit the affected path.
        using var misconfigured = _host.WithConfiguration(new Dictionary<string, string?>
        {
            ["Readiness:WarmupPeriod"] = "-00:00:01",
        });

        var error = Assert.Throws<OptionsValidationException>(() => misconfigured.Services);

        Assert.Contains("WarmupPeriod", error.Message, StringComparison.Ordinal);
    }

    /// <summary>Host under test. Named rather than aliased so failures point somewhere obvious.</summary>
    public sealed class Host : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) =>
            builder.UseEnvironment("Testing");

        internal WebApplicationFactory<Program> WithConfiguration(
            IDictionary<string, string?> settings) =>
            WithWebHostBuilder(b => b.ConfigureAppConfiguration(
                (_, config) => config.AddInMemoryCollection(settings)));
    }
}
