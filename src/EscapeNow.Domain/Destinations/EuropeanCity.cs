namespace EscapeNow.Domain.Destinations;

public sealed record EuropeanCity(
    string Name,
    string Country,
    double Latitude,
    double Longitude,
    string ImageUrl);
