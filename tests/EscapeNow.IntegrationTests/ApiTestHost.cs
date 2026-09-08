using EscapeNow.Application.Abstractions;
using EscapeNow.Domain.Destinations;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace EscapeNow.IntegrationTests;

[CollectionDefinition("api")]
public sealed class ApiHostFixture : ICollectionFixture<ApiTestHost>;

/// <summary>
/// Starts the real host through <see cref="WebApplicationFactory{TEntryPoint}"/> — the same
/// Program.cs, the same composition root, the same routing — and drives it over HTTP.
///
/// The forecast port is replaced with an in-memory fake. Calling the real Open-Meteo API here
/// would fan out across the catalog, put a network dependency into <c>check</c>, and make the
/// stage slow and flaky.
/// </summary>
public sealed class ApiTestHost : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Same variable CI sets on the checks job. Falls back to the published demo
        // credential so a local `dotnet test` against compose works without extra env.
        var connectionString =
            Environment.GetEnvironmentVariable("CONNECTIONSTRINGS__ESCAPENOW")
            ?? "Host=localhost;Port=5432;Database=escapenow;Username=escapenow;Password=escapenow";
        builder.UseSetting("ConnectionStrings:EscapeNow", connectionString);

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IWeatherService>();
            services.AddSingleton<IWeatherService, FakeWeatherService>();
        });
    }

    /// <summary>
    /// Returns a deterministic forecast whose quality varies by longitude, so the ranking has
    /// something real to order. Hand-written rather than mocked: the port has one member.
    /// </summary>
    internal sealed class FakeWeatherService : IWeatherService
    {
        internal const int DayCount = 7;

        public Task<IReadOnlyList<DailyWeatherSnapshot>> GetForecastAsync(
            WeatherForecastRequest request,
            CancellationToken cancellationToken = default)
        {
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
