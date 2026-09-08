using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public sealed class CityCatalogService(ICityCatalog cityCatalog) : ICityCatalogService
{
    public Task<IReadOnlyList<EuropeanCity>> ListAsync(CancellationToken cancellationToken = default) =>
        cityCatalog.ListAsync(cancellationToken);

    public Task<EuropeanCity?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        cityCatalog.GetByIdAsync(id, cancellationToken);

    public async Task<CityMutationResult> CreateAsync(
        CityWriteRequest request,
        CancellationToken cancellationToken = default)
    {
        if (Validate(request) is { } invalid)
        {
            return invalid;
        }

        var fields = ReadFields(request);

        var duplicate = await cityCatalog.FindByNameAsync(fields.Name, cancellationToken);
        if (duplicate is not null)
        {
            return new CityMutationResult.DuplicateName();
        }

        var city = new EuropeanCity(
            Guid.CreateVersion7(),
            fields.Name,
            fields.Country,
            fields.Latitude,
            fields.Longitude,
            fields.ImageUrl);

        try
        {
            await cityCatalog.AddAsync(city, cancellationToken);
        }
        catch (DuplicateCityNameException)
        {
            return new CityMutationResult.DuplicateName();
        }

        return new CityMutationResult.Succeeded(city);
    }

    public async Task<CityMutationResult> ReplaceAsync(
        Guid id,
        CityWriteRequest request,
        CancellationToken cancellationToken = default)
    {
        var existing = await cityCatalog.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return new CityMutationResult.NotFound();
        }

        if (Validate(request) is { } invalid)
        {
            return invalid;
        }

        var fields = ReadFields(request);

        var duplicate = await cityCatalog.FindByNameAsync(fields.Name, cancellationToken);
        if (duplicate is not null && duplicate.Id != id)
        {
            return new CityMutationResult.DuplicateName();
        }

        var city = existing with
        {
            Name = fields.Name,
            Country = fields.Country,
            Latitude = fields.Latitude,
            Longitude = fields.Longitude,
            ImageUrl = fields.ImageUrl
        };

        try
        {
            await cityCatalog.UpdateAsync(city, cancellationToken);
        }
        catch (DuplicateCityNameException)
        {
            return new CityMutationResult.DuplicateName();
        }

        return new CityMutationResult.Succeeded(city);
    }

    public Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default) =>
        cityCatalog.DeleteAsync(id, cancellationToken);

    private static CityMutationResult.Invalid? Validate(CityWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return new CityMutationResult.Invalid("Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Country))
        {
            return new CityMutationResult.Invalid("Country is required.");
        }

        if (string.IsNullOrWhiteSpace(request.ImageUrl))
        {
            return new CityMutationResult.Invalid("Image URL is required.");
        }

        if (request.Latitude is null || request.Latitude < -90 || request.Latitude > 90)
        {
            return new CityMutationResult.Invalid("Latitude must be between -90 and 90.");
        }

        if (request.Longitude is null || request.Longitude < -180 || request.Longitude > 180)
        {
            return new CityMutationResult.Invalid("Longitude must be between -180 and 180.");
        }

        return null;
    }

    private static (string Name, string Country, double Latitude, double Longitude, string ImageUrl)
        ReadFields(CityWriteRequest request)
    {
        // Validate already rejected missing values; these cannot be null here.
        return (
            request.Name!.Trim(),
            request.Country!.Trim(),
            request.Latitude!.Value,
            request.Longitude!.Value,
            request.ImageUrl!.Trim());
    }
}
