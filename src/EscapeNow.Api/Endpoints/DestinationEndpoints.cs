using EscapeNow.Application.Destinations;
using EscapeNow.Domain.Destinations;

namespace EscapeNow.Api.Endpoints;

public static class DestinationEndpoints
{
    public static IEndpointRouteBuilder MapDestinationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/destinations").WithTags("Destinations");

        group.MapGet("/recommendations", async (
            DateOnly? startDate,
            DateOnly? endDate,
            string? temperaturePreference,
            string? weatherPreference,
            IDestinationRecommendationService recommendationService,
            CancellationToken cancellationToken) =>
        {
            var temperature = ParseTemperaturePreference(temperaturePreference);
            var weather = ParseWeatherPreference(weatherPreference);

            var recommendations = await recommendationService.GetRecommendationsAsync(
                startDate,
                endDate,
                temperature,
                weather,
                cancellationToken);

            return Results.Ok(recommendations);
        });

        group.MapGet("/{city}", async (
            string city,
            DateOnly? startDate,
            DateOnly? endDate,
            IDestinationRecommendationService recommendationService,
            CancellationToken cancellationToken) =>
        {
            var detail = await recommendationService.GetDestinationAsync(
                city,
                startDate,
                endDate,
                cancellationToken);

            return detail is null ? Results.NotFound() : Results.Ok(detail);
        });

        return app;
    }

    private static TemperaturePreference ParseTemperaturePreference(string? value) =>
        value?.ToLowerInvariant() switch
        {
            "warm" => TemperaturePreference.Warm,
            "mild" => TemperaturePreference.Mild,
            _ => TemperaturePreference.Any
        };

    private static WeatherPreference ParseWeatherPreference(string? value) =>
        value?.ToLowerInvariant() switch
        {
            "sunny" or "mostlysunny" or "mostly-sunny" => WeatherPreference.MostlySunny,
            "lowrain" or "low-rain" => WeatherPreference.LowRain,
            _ => WeatherPreference.Any
        };
}
