using EscapeNow.Domain.Destinations;

namespace EscapeNow.Infrastructure.Persistence;

internal sealed class CityRecord
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Country { get; set; } = string.Empty;

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    public string ImageUrl { get; set; } = string.Empty;

    public EuropeanCity ToDomain() =>
        new(Id, Name, Country, Latitude, Longitude, ImageUrl);

    public static CityRecord FromDomain(EuropeanCity city) =>
        new()
        {
            Id = city.Id,
            Name = city.Name,
            Country = city.Country,
            Latitude = city.Latitude,
            Longitude = city.Longitude,
            ImageUrl = city.ImageUrl
        };

    public void CopyFrom(EuropeanCity city)
    {
        Name = city.Name;
        Country = city.Country;
        Latitude = city.Latitude;
        Longitude = city.Longitude;
        ImageUrl = city.ImageUrl;
    }
}
