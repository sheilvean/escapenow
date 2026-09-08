using EscapeNow.Domain.Destinations;

namespace EscapeNow.UnitTests.Destinations;

public sealed class CityBreakScorerTests
{
    [Fact]
    public void Ideal_conditions_score_near_the_top()
    {
        var score = CityBreakScorer.Calculate(
            22,
            WeatherConditionKind.Sunny,
            10);

        Assert.InRange(score, 85, 100);
    }

    [Fact]
    public void Stormy_weather_reduces_the_score()
    {
        var score = CityBreakScorer.Calculate(
            22,
            WeatherConditionKind.Thunderstorm,
            80);

        Assert.True(score < 60);
    }

    [Fact]
    public void Build_reasons_includes_sunny_and_comfortable_temperature()
    {
        var days = new List<DailyWeatherSnapshot>
        {
            new(new DateOnly(2026, 9, 12), 18, 24, 10, WeatherConditionKind.Sunny),
            new(new DateOnly(2026, 9, 13), 17, 23, 12, WeatherConditionKind.PartlyCloudy),
            new(new DateOnly(2026, 9, 14), 18, 25, 8, WeatherConditionKind.Sunny)
        };

        var reasons = CityBreakScorer.BuildReasons(days);

        Assert.Contains(reasons, r => r.Contains("Sunny", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(reasons, r => r.Contains("temperature", StringComparison.OrdinalIgnoreCase));
    }
}
