using EscapeNow.Application.Abstractions;
using EscapeNow.Application.Destinations;
using EscapeNow.Domain.Destinations;

namespace EscapeNow.UnitTests.Destinations;

public sealed class DestinationRecommendationServiceTests
{
    [Fact]
    public async Task An_empty_catalog_returns_an_empty_recommendation_list()
    {
        var service = new DestinationRecommendationService(new FakeWeatherService(), new FakeCityCatalog([]));

        var results = await service.GetRecommendationsAsync(
            null,
            null,
            TemperaturePreference.Any,
            WeatherPreference.Any,
            TestContext.Current.CancellationToken);

        Assert.Empty(results);
    }

    [Fact]
    public async Task Each_recommendation_carries_the_city_uuid()
    {
        var lisbon = new EuropeanCity(
            Guid.Parse("391ba9cb-8298-49be-8163-bf8ad360a411"),
            "Lisbon",
            "Portugal",
            38.7223,
            -9.1393,
            "https://example.com/lisbon.jpg");
        var service = new DestinationRecommendationService(
            new FakeWeatherService(),
            new FakeCityCatalog([lisbon]));

        var results = await service.GetRecommendationsAsync(
            null,
            null,
            TemperaturePreference.Any,
            WeatherPreference.Any,
            TestContext.Current.CancellationToken);

        var recommendation = Assert.Single(results);
        Assert.Equal(lisbon.Id, recommendation.Id);
        Assert.Equal("Lisbon", recommendation.City);
    }

    private sealed class FakeCityCatalog(IReadOnlyList<EuropeanCity> cities) : ICityCatalog
    {
        public Task<IReadOnlyList<EuropeanCity>> ListAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(cities);

        public Task<EuropeanCity?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
            Task.FromResult(cities.FirstOrDefault(city => city.Id == id));

        public Task<EuropeanCity?> FindByNameAsync(string name, CancellationToken cancellationToken = default) =>
            Task.FromResult(cities.FirstOrDefault(city =>
                string.Equals(city.Name, name, StringComparison.OrdinalIgnoreCase)));

        public Task AddAsync(EuropeanCity city, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task UpdateAsync(EuropeanCity city, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class FakeWeatherService : IWeatherService
    {
        public Task<IReadOnlyList<DailyWeatherSnapshot>> GetForecastAsync(
            WeatherForecastRequest request,
            CancellationToken cancellationToken = default)
        {
            IReadOnlyList<DailyWeatherSnapshot> days =
            [
                new(request.StartDate, 18, 24, 10, WeatherConditionKind.Sunny)
            ];

            return Task.FromResult(days);
        }
    }
}
