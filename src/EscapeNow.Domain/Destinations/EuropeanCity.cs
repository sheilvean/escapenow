namespace EscapeNow.Domain.Destinations;

public sealed record EuropeanCity(
    Guid Id,
    string Name,
    string Country,
    double Latitude,
    double Longitude,
    string ImageUrl);
