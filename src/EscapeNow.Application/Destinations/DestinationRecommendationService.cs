using EscapeNow.Application.Abstractions;
using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public sealed class DestinationRecommendationService(IWeatherService weatherService) : IDestinationRecommendationService
{
    public async Task<IReadOnlyList<DestinationRecommendation>> GetRecommendationsAsync(
        DateOnly? startDate,
        DateOnly? endDate,
        TemperaturePreference temperaturePreference,
        WeatherPreference weatherPreference,
        CancellationToken cancellationToken = default)
    {
        var (windowStart, windowEnd) = ResolveWindow(startDate, endDate);
        using var throttle = new SemaphoreSlim(3);

        var tasks = DestinationCatalog.Cities.Select(async city =>
        {
            await throttle.WaitAsync(cancellationToken);
            try
            {
                var forecast = await weatherService.GetForecastAsync(
                    new WeatherForecastRequest(city.Latitude, city.Longitude, windowStart, windowEnd),
                    cancellationToken);

                if (forecast.Count == 0)
                {
                    return null;
                }

                return MapRecommendation(city, forecast, temperaturePreference, weatherPreference);
            }
            finally
            {
                throttle.Release();
            }
        });

        var recommendations = (await Task.WhenAll(tasks))
            .Where(recommendation => recommendation is not null)
            .Cast<DestinationRecommendation>()
            .ToList();

        return recommendations
            .OrderByDescending(r => r.Score)
            .Take(5)
            .ToList();
    }

    public async Task<DestinationDetail?> GetDestinationAsync(
        string city,
        DateOnly? startDate,
        DateOnly? endDate,
        CancellationToken cancellationToken = default)
    {
        var destination = DestinationCatalog.FindByName(city);
        if (destination is null)
        {
            return null;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var windowStart = startDate ?? today;
        var windowEnd = endDate ?? today.AddDays(6);

        var forecast = await weatherService.GetForecastAsync(
            new WeatherForecastRequest(destination.Latitude, destination.Longitude, windowStart, windowEnd),
            cancellationToken);

        if (forecast.Count == 0)
        {
            return null;
        }

        var dominant = DominantCondition(forecast);
        var avgTemp = Math.Round(forecast.Average(d => (d.MinTemperature + d.MaxTemperature) / 2.0), 1);
        var avgRain = (int)Math.Round(forecast.Average(d => d.RainProbability));
        var score = CityBreakScorer.Calculate(avgTemp, dominant, avgRain);
        var recommendation = CityBreakScorer.BuildRecommendation(avgTemp, dominant, avgRain, score);

        return new DestinationDetail(
            destination.Name,
            destination.Country,
            destination.Latitude,
            destination.Longitude,
            score,
            recommendation,
            destination.ImageUrl,
            forecast.Select(ToForecastDay).ToList(),
            CityBreakScorer.BuildReasons(forecast).ToList());
    }

    private static DestinationRecommendation MapRecommendation(
        EuropeanCity city,
        IReadOnlyList<DailyWeatherSnapshot> forecast,
        TemperaturePreference temperaturePreference,
        WeatherPreference weatherPreference)
    {
        var dominant = DominantCondition(forecast);
        var avgTemp = Math.Round(forecast.Average(d => (d.MinTemperature + d.MaxTemperature) / 2.0), 1);
        var avgRain = (int)Math.Round(forecast.Average(d => d.RainProbability));
        var score = CityBreakScorer.Calculate(avgTemp, dominant, avgRain, temperaturePreference, weatherPreference);
        var recommendation = CityBreakScorer.BuildRecommendation(avgTemp, dominant, avgRain, score);
        var label = WeatherCodeMapper.ToLabel(dominant);

        return new DestinationRecommendation(
            city.Name,
            city.Country,
            city.Latitude,
            city.Longitude,
            avgTemp,
            avgRain,
            label,
            dominant.ToString(),
            score,
            recommendation,
            city.ImageUrl);
    }

    private static WeatherConditionKind DominantCondition(IReadOnlyList<DailyWeatherSnapshot> forecast)
    {
        return forecast
            .GroupBy(day => day.Condition)
            .OrderByDescending(group => group.Count())
            .ThenByDescending(group => group.Key switch
            {
                WeatherConditionKind.Sunny => 5,
                WeatherConditionKind.PartlyCloudy => 4,
                WeatherConditionKind.Cloudy => 3,
                _ => 1
            })
            .First()
            .Key;
    }

    private static WeatherForecastDay ToForecastDay(DailyWeatherSnapshot day) =>
        new(
            day.Date,
            Math.Round(day.MinTemperature, 0),
            Math.Round(day.MaxTemperature, 0),
            day.RainProbability,
            WeatherCodeMapper.ToLabel(day.Condition),
            day.Condition.ToString());

    private static (DateOnly Start, DateOnly End) ResolveWindow(DateOnly? startDate, DateOnly? endDate)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (startDate is not null && endDate is not null)
        {
            return (startDate.Value, endDate.Value);
        }

        if (startDate is not null)
        {
            return (startDate.Value, startDate.Value.AddDays(2));
        }

        return (today, today.AddDays(6));
    }
}
