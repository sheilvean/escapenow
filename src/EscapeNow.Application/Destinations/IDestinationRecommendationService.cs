using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public interface IDestinationRecommendationService
{
    Task<IReadOnlyList<DestinationRecommendation>> GetRecommendationsAsync(
        DateOnly? startDate,
        DateOnly? endDate,
        TemperaturePreference temperaturePreference,
        WeatherPreference weatherPreference,
        CancellationToken cancellationToken = default);

    Task<DestinationDetail?> GetDestinationAsync(
        Guid id,
        DateOnly? startDate,
        DateOnly? endDate,
        CancellationToken cancellationToken = default);
}
