using EscapeNow.Application.Destinations;
using EscapeNow.Domain.Destinations;

namespace EscapeNow.UnitTests.Destinations;

public sealed class CityCatalogServiceTests
{
    [Fact]
    public async Task Create_assigns_a_uuid_and_stores_the_city()
    {
        var catalog = new FakeCityCatalog();
        var service = new CityCatalogService(catalog);

        var result = await service.CreateAsync(
            new CityWriteRequest("Split", "Croatia", 43.5081, 16.4402, "https://example.com/split.jpg"),
            TestContext.Current.CancellationToken);

        var succeeded = Assert.IsType<CityMutationResult.Succeeded>(result);
        Assert.NotEqual(Guid.Empty, succeeded.City.Id);
        Assert.Equal("Split", succeeded.City.Name);
        Assert.Single(catalog.Cities);
    }

    [Fact]
    public async Task Create_rejects_a_duplicate_name_ignoring_case()
    {
        var catalog = new FakeCityCatalog();
        catalog.Cities.Add(new EuropeanCity(
            Guid.CreateVersion7(), "Lisbon", "Portugal", 38.7, -9.1, "https://example.com/lisbon.jpg"));
        var service = new CityCatalogService(catalog);

        var result = await service.CreateAsync(
            new CityWriteRequest("lisbon", "Portugal", 38.7, -9.1, "https://example.com/lisbon.jpg"),
            TestContext.Current.CancellationToken);

        Assert.IsType<CityMutationResult.DuplicateName>(result);
        Assert.Single(catalog.Cities);
    }

    [Fact]
    public async Task Create_rejects_an_empty_name()
    {
        var service = new CityCatalogService(new FakeCityCatalog());

        var result = await service.CreateAsync(
            new CityWriteRequest("  ", "Portugal", 38.7, -9.1, "https://example.com/x.jpg"),
            TestContext.Current.CancellationToken);

        var invalid = Assert.IsType<CityMutationResult.Invalid>(result);
        Assert.Contains("Name", invalid.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Create_rejects_latitude_outside_range()
    {
        var service = new CityCatalogService(new FakeCityCatalog());

        var result = await service.CreateAsync(
            new CityWriteRequest("North Pole", "Arctic", 91, 0, "https://example.com/x.jpg"),
            TestContext.Current.CancellationToken);

        var invalid = Assert.IsType<CityMutationResult.Invalid>(result);
        Assert.Contains("Latitude", invalid.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Replace_keeps_the_uuid_and_updates_fields()
    {
        var id = Guid.CreateVersion7();
        var catalog = new FakeCityCatalog();
        catalog.Cities.Add(new EuropeanCity(id, "Lisbon", "Portugal", 38.7, -9.1, "https://example.com/old.jpg"));
        var service = new CityCatalogService(catalog);

        var result = await service.ReplaceAsync(
            id,
            new CityWriteRequest("Lisboa", "Portugal", 38.7223, -9.1393, "https://example.com/new.jpg"),
            TestContext.Current.CancellationToken);

        var succeeded = Assert.IsType<CityMutationResult.Succeeded>(result);
        Assert.Equal(id, succeeded.City.Id);
        Assert.Equal("Lisboa", succeeded.City.Name);
        Assert.Equal("https://example.com/new.jpg", succeeded.City.ImageUrl);
    }

    [Fact]
    public async Task Replace_unknown_id_is_not_found()
    {
        var service = new CityCatalogService(new FakeCityCatalog());

        var result = await service.ReplaceAsync(
            Guid.CreateVersion7(),
            new CityWriteRequest("Split", "Croatia", 43.5, 16.4, "https://example.com/x.jpg"),
            TestContext.Current.CancellationToken);

        Assert.IsType<CityMutationResult.NotFound>(result);
    }

    [Fact]
    public async Task Delete_removes_the_city()
    {
        var id = Guid.CreateVersion7();
        var catalog = new FakeCityCatalog();
        catalog.Cities.Add(new EuropeanCity(id, "Lisbon", "Portugal", 38.7, -9.1, "https://example.com/x.jpg"));
        var service = new CityCatalogService(catalog);

        var deleted = await service.DeleteAsync(id, TestContext.Current.CancellationToken);

        Assert.True(deleted);
        Assert.Empty(catalog.Cities);
    }

    private sealed class FakeCityCatalog : ICityCatalog
    {
        public List<EuropeanCity> Cities { get; } = [];

        public Task<IReadOnlyList<EuropeanCity>> ListAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<EuropeanCity>>(Cities);

        public Task<EuropeanCity?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
            Task.FromResult(Cities.FirstOrDefault(city => city.Id == id));

        public Task<EuropeanCity?> FindByNameAsync(string name, CancellationToken cancellationToken = default) =>
            Task.FromResult(Cities.FirstOrDefault(city =>
                string.Equals(city.Name, name, StringComparison.OrdinalIgnoreCase)));

        public Task AddAsync(EuropeanCity city, CancellationToken cancellationToken = default)
        {
            Cities.Add(city);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(EuropeanCity city, CancellationToken cancellationToken = default)
        {
            var index = Cities.FindIndex(existing => existing.Id == city.Id);
            if (index >= 0)
            {
                Cities[index] = city;
            }

            return Task.CompletedTask;
        }

        public Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
        {
            var removed = Cities.RemoveAll(city => city.Id == id);
            return Task.FromResult(removed > 0);
        }
    }
}
