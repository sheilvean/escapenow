namespace EscapeNow.Application.Destinations;

public sealed record WeatherForecastDay(
    DateOnly Date,
    double MinTemperature,
    double MaxTemperature,
    int RainProbability,
    string Condition,
    string ConditionKey);

public sealed record DestinationRecommendation(
    Guid Id,
    string City,
    string Country,
    double Latitude,
    double Longitude,
    double AverageTemperature,
    int RainProbability,
    string WeatherCondition,
    string WeatherConditionKey,
    int Score,
    string Recommendation,
    string ImageUrl);

public sealed record DestinationDetail(
    Guid Id,
    string City,
    string Country,
    double Latitude,
    double Longitude,
    int Score,
    string Recommendation,
    string ImageUrl,
    IReadOnlyList<WeatherForecastDay> Forecast,
    IReadOnlyList<string> Reasons);
