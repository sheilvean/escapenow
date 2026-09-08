namespace EscapeNow.Application.Destinations;

public sealed record CityWriteRequest(
    string? Name,
    string? Country,
    double? Latitude,
    double? Longitude,
    string? ImageUrl);
