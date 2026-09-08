using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using EscapeNow.Application.Abstractions;
using EscapeNow.Domain.Destinations;

namespace EscapeNow.Infrastructure.Weather;

public sealed class OpenMeteoWeatherService(HttpClient httpClient) : IWeatherService
{
    public async Task<IReadOnlyList<DailyWeatherSnapshot>> GetForecastAsync(
        WeatherForecastRequest request,
        CancellationToken cancellationToken = default)
    {
        var query =
            $"v1/forecast?latitude={request.Latitude.ToString(CultureInfo.InvariantCulture)}" +
            $"&longitude={request.Longitude.ToString(CultureInfo.InvariantCulture)}" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
            "&timezone=auto" +
            $"&start_date={request.StartDate:yyyy-MM-dd}&end_date={request.EndDate:yyyy-MM-dd}";

        using var response = await SendWithRetryAsync(query, cancellationToken);

        var payload = await response.Content.ReadFromJsonAsync<OpenMeteoForecastResponse>(
            cancellationToken: cancellationToken);

        if (payload?.Daily is null || payload.Daily.Time.Count == 0)
        {
            return [];
        }

        var snapshots = new List<DailyWeatherSnapshot>();
        for (var i = 0; i < payload.Daily.Time.Count; i++)
        {
            if (!DateOnly.TryParse(payload.Daily.Time[i], out var date))
            {
                continue;
            }

            if (date < request.StartDate || date > request.EndDate)
            {
                continue;
            }

            var minTemp = payload.Daily.TemperatureMin.ElementAtOrDefault(i);
            var maxTemp = payload.Daily.TemperatureMax.ElementAtOrDefault(i);
            var rain = payload.Daily.PrecipitationProbability.ElementAtOrDefault(i);
            var code = payload.Daily.WeatherCode.ElementAtOrDefault(i);

            snapshots.Add(new DailyWeatherSnapshot(
                date,
                minTemp,
                maxTemp,
                (int)Math.Round(rain),
                WeatherCodeMapper.FromCode(code)));
        }

        return snapshots;
    }

    private async Task<HttpResponseMessage> SendWithRetryAsync(string query, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 4; attempt++)
        {
            var response = await httpClient.GetAsync(query, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return response;
            }

            if (response.StatusCode is not (HttpStatusCode.ServiceUnavailable or HttpStatusCode.TooManyRequests))
            {
                response.EnsureSuccessStatusCode();
            }

            response.Dispose();
            await Task.Delay(TimeSpan.FromMilliseconds(400 * (attempt + 1)), cancellationToken);
        }

        throw new HttpRequestException("Open-Meteo is temporarily unavailable. Please try again shortly.");
    }

    private sealed class OpenMeteoForecastResponse
    {
        [JsonPropertyName("daily")]
        public OpenMeteoDaily? Daily { get; init; }
    }

    private sealed class OpenMeteoDaily
    {
        [JsonPropertyName("time")]
        public List<string> Time { get; init; } = [];

        [JsonPropertyName("temperature_2m_max")]
        public List<double> TemperatureMax { get; init; } = [];

        [JsonPropertyName("temperature_2m_min")]
        public List<double> TemperatureMin { get; init; } = [];

        [JsonPropertyName("precipitation_probability_max")]
        public List<double> PrecipitationProbability { get; init; } = [];

        [JsonPropertyName("weather_code")]
        public List<int> WeatherCode { get; init; } = [];
    }
}
