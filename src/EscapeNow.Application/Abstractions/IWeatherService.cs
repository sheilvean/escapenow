using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Abstractions;

public sealed record WeatherForecastRequest(
    double Latitude,
    double Longitude,
    DateOnly StartDate,
    DateOnly EndDate);

public interface IWeatherService
{
    Task<IReadOnlyList<DailyWeatherSnapshot>> GetForecastAsync(
        WeatherForecastRequest request,
        CancellationToken cancellationToken = default);
}
