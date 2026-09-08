using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EscapeNow.Infrastructure.Persistence;

namespace EscapeNow.IntegrationTests;

[Collection("api")]
public sealed class CityEndpointsTests
{
    private readonly ApiTestHost _host;

    public CityEndpointsTests(ApiTestHost host) => _host = host;

    [Fact]
    public async Task Listing_includes_the_seeded_catalog_without_authentication()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync("/api/cities", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        var cities = body.EnumerateArray().ToList();

        Assert.True(cities.Count >= 12);

        var lisbon = cities.Single(city =>
            string.Equals(city.GetProperty("name").GetString(), "Lisbon", StringComparison.Ordinal));
        Assert.Equal(CityCatalogSeedIds.Lisbon, lisbon.GetProperty("id").GetGuid());
        Assert.Equal("Portugal", lisbon.GetProperty("country").GetString());
    }

    [Fact]
    public async Task Lisbon_appears_once_after_startup_seed()
    {
        using var client = _host.CreateClient();

        using var response = await client.GetAsync("/api/cities", TestContext.Current.CancellationToken);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);

        var lisbonCount = body.EnumerateArray().Count(city =>
            string.Equals(city.GetProperty("name").GetString(), "Lisbon", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(1, lisbonCount);
    }

    [Fact]
    public async Task A_city_can_be_created_read_updated_and_deleted()
    {
        using var client = _host.CreateClient();
        var name = $"Testville-{Guid.CreateVersion7():N}";

        using var createResponse = await client.PostAsJsonAsync(
            "/api/cities",
            new
            {
                name,
                country = "Testland",
                latitude = 10.5,
                longitude = 20.25,
                imageUrl = "https://example.com/testville.jpg"
            },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        var id = created.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, id);
        Assert.Equal(name, created.GetProperty("name").GetString());

        using var getResponse = await client.GetAsync(
            $"/api/cities/{id}",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        var renamed = $"{name}-renamed";
        using var updateResponse = await client.PutAsJsonAsync(
            $"/api/cities/{id}",
            new
            {
                name = renamed,
                country = "Testland",
                latitude = 11.0,
                longitude = 21.0,
                imageUrl = "https://example.com/renamed.jpg"
            },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updated = await updateResponse.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal(id, updated.GetProperty("id").GetGuid());
        Assert.Equal(renamed, updated.GetProperty("name").GetString());
        Assert.Equal(11.0, updated.GetProperty("latitude").GetDouble());

        using var deleteResponse = await client.DeleteAsync(
            $"/api/cities/{id}",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        using var missingResponse = await client.GetAsync(
            $"/api/cities/{id}",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, missingResponse.StatusCode);
    }

    [Fact]
    public async Task A_duplicate_name_is_conflict()
    {
        using var client = _host.CreateClient();

        using var response = await client.PostAsJsonAsync(
            "/api/cities",
            new
            {
                name = "lisbon",
                country = "Portugal",
                latitude = 38.7,
                longitude = -9.1,
                imageUrl = "https://example.com/lisbon.jpg"
            },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal(409, body.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task Validation_failure_is_problem_details()
    {
        using var client = _host.CreateClient();

        using var response = await client.PostAsJsonAsync(
            "/api/cities",
            new
            {
                name = "",
                country = "Portugal",
                latitude = 38.7,
                longitude = -9.1,
                imageUrl = "https://example.com/x.jpg"
            },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            TestContext.Current.CancellationToken);
        Assert.Equal(400, body.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task An_unknown_city_uuid_is_not_found()
    {
        using var client = _host.CreateClient();
        var missing = Guid.Parse("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");

        using var getResponse = await client.GetAsync(
            $"/api/cities/{missing}",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, getResponse.StatusCode);

        using var deleteResponse = await client.DeleteAsync(
            $"/api/cities/{missing}",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, deleteResponse.StatusCode);
    }
}
