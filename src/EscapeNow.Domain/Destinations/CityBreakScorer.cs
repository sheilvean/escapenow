namespace EscapeNow.Domain.Destinations;

public static class CityBreakScorer
{
    public static int Calculate(
        double averageTemperature,
        WeatherConditionKind dominantCondition,
        int averageRainProbability,
        TemperaturePreference temperaturePreference = TemperaturePreference.Any,
        WeatherPreference weatherPreference = WeatherPreference.Any)
    {
        var score = 50;

        score += TemperatureBonus(averageTemperature, temperaturePreference);
        score += ConditionBonus(dominantCondition, weatherPreference);
        score += RainBonus(averageRainProbability, weatherPreference);
        score += ConditionPenalty(dominantCondition);
        score += TemperaturePenalty(averageTemperature);

        return Math.Clamp(score, 0, 100);
    }

    private static int TemperatureBonus(double temperature, TemperaturePreference preference)
    {
        var inIdealRange = temperature is >= 18 and <= 26;
        var warmEnough = temperature >= 20;
        var mildEnough = temperature is >= 14 and <= 24;

        if (preference is TemperaturePreference.Warm)
        {
            if (warmEnough && inIdealRange) return 25;
            if (warmEnough) return 15;
            if (temperature >= 16) return 5;
            return -10;
        }

        if (preference is TemperaturePreference.Mild)
        {
            if (mildEnough && inIdealRange) return 22;
            if (mildEnough) return 12;
            if (temperature >= 12) return 0;
            return -12;
        }

        if (inIdealRange) return 20;
        if (temperature is >= 15 and <= 28) return 10;
        return 0;
    }

    private static int ConditionBonus(WeatherConditionKind condition, WeatherPreference preference)
    {
        var sunnyBonus = condition switch
        {
            WeatherConditionKind.Sunny => 20,
            WeatherConditionKind.PartlyCloudy => 12,
            WeatherConditionKind.Cloudy => 0,
            _ => -5
        };

        if (preference is WeatherPreference.MostlySunny)
        {
            return condition switch
            {
                WeatherConditionKind.Sunny => 25,
                WeatherConditionKind.PartlyCloudy => 15,
                WeatherConditionKind.Cloudy => -5,
                WeatherConditionKind.Rain or WeatherConditionKind.HeavyRain => -15,
                _ => sunnyBonus
            };
        }

        return sunnyBonus;
    }

    private static int RainBonus(int rainProbability, WeatherPreference preference)
    {
        if (rainProbability < 20) return preference is WeatherPreference.LowRain ? 15 : 10;
        if (rainProbability < 40) return preference is WeatherPreference.LowRain ? 0 : 0;
        if (rainProbability < 60) return preference is WeatherPreference.LowRain ? -10 : -5;
        return preference is WeatherPreference.LowRain ? -20 : -15;
    }

    private static int ConditionPenalty(WeatherConditionKind condition) => condition switch
    {
        WeatherConditionKind.HeavyRain => -25,
        WeatherConditionKind.Thunderstorm => -30,
        WeatherConditionKind.Rain => -10,
        WeatherConditionKind.Snow => -15,
        WeatherConditionKind.Fog => -5,
        _ => 0
    };

    private static int TemperaturePenalty(double temperature)
    {
        if (temperature < 8) return -25;
        if (temperature < 12) return -15;
        if (temperature > 32) return -25;
        if (temperature > 28) return -15;
        return 0;
    }

    public static string BuildRecommendation(
        double averageTemperature,
        WeatherConditionKind dominantCondition,
        int averageRainProbability,
        int score)
    {
        if (score >= 85)
        {
            return "Warm, sunny and ideal for a spontaneous weekend escape.";
        }

        if (score >= 70)
        {
            return "Comfortable weather and great conditions for exploring on foot.";
        }

        if (dominantCondition is WeatherConditionKind.Rain or WeatherConditionKind.HeavyRain)
        {
            return "Pack a light jacket — showers are possible, but still worth a visit.";
        }

        if (averageTemperature < 14)
        {
            return "Cooler days ahead — perfect for museums, cafés and cozy city strolls.";
        }

        if (averageRainProbability > 50)
        {
            return "Mixed skies expected — plan indoor highlights alongside outdoor sights.";
        }

        return "A solid pick for a spontaneous European city break this week.";
    }

    public static IReadOnlyList<string> BuildReasons(
        IReadOnlyList<DailyWeatherSnapshot> days)
    {
        var reasons = new List<string>();
        var sunnyDays = days.Count(d => d.Condition is WeatherConditionKind.Sunny or WeatherConditionKind.PartlyCloudy);
        var avgTemp = days.Average(d => (d.MinTemperature + d.MaxTemperature) / 2.0);
        var maxRain = days.Max(d => d.RainProbability);

        if (sunnyDays >= days.Count * 0.6)
        {
            reasons.Add("Sunny weather throughout most of the week");
        }
        else if (sunnyDays >= days.Count / 2)
        {
            reasons.Add("Plenty of clear spells for sightseeing");
        }

        if (avgTemp is >= 18 and <= 26)
        {
            reasons.Add("Comfortable temperature for walking and outdoor dining");
        }
        else if (avgTemp >= 15)
        {
            reasons.Add("Mild temperatures ideal for exploring the city");
        }

        if (maxRain < 25)
        {
            reasons.Add("Very low probability of rain");
        }
        else if (maxRain < 45)
        {
            reasons.Add("Rain is unlikely to disrupt your plans");
        }

        if (reasons.Count == 0)
        {
            reasons.Add("A change of scenery with authentic local atmosphere");
            reasons.Add("Great cafés and landmarks to discover at your own pace");
        }

        return reasons.Take(3).ToList();
    }
}

public sealed record DailyWeatherSnapshot(
    DateOnly Date,
    double MinTemperature,
    double MaxTemperature,
    int RainProbability,
    WeatherConditionKind Condition);
