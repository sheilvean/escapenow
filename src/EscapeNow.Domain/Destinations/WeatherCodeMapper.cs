namespace EscapeNow.Domain.Destinations;

public static class WeatherCodeMapper
{
    public static WeatherConditionKind FromCode(int code) => code switch
    {
        0 => WeatherConditionKind.Sunny,
        1 or 2 => WeatherConditionKind.PartlyCloudy,
        3 => WeatherConditionKind.Cloudy,
        45 or 48 => WeatherConditionKind.Fog,
        51 or 53 or 55 => WeatherConditionKind.Drizzle,
        61 or 63 => WeatherConditionKind.Rain,
        65 or 66 or 67 => WeatherConditionKind.HeavyRain,
        71 or 73 or 75 or 77 or 85 or 86 => WeatherConditionKind.Snow,
        80 or 81 or 82 => WeatherConditionKind.Rain,
        95 or 96 or 99 => WeatherConditionKind.Thunderstorm,
        _ => WeatherConditionKind.Unknown
    };

    public static string ToLabel(WeatherConditionKind kind) => kind switch
    {
        WeatherConditionKind.Sunny => "Sunny",
        WeatherConditionKind.PartlyCloudy => "Partly cloudy",
        WeatherConditionKind.Cloudy => "Cloudy",
        WeatherConditionKind.Fog => "Foggy",
        WeatherConditionKind.Drizzle => "Light drizzle",
        WeatherConditionKind.Rain => "Rain showers",
        WeatherConditionKind.HeavyRain => "Heavy rain",
        WeatherConditionKind.Snow => "Snow",
        WeatherConditionKind.Thunderstorm => "Thunderstorms",
        _ => "Variable"
    };
}
