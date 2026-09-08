using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public static class DestinationCatalog
{
    public static IReadOnlyList<EuropeanCity> Cities { get; } =
    [
        new("Barcelona", "Spain", 41.3874, 2.1686,
            "https://images.unsplash.com/photo-1583422409516-2895faad9948?w=1200&q=80"),
        new("Lisbon", "Portugal", 38.7223, -9.1393,
            "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=1200&q=80"),
        new("Rome", "Italy", 41.9028, 12.4964,
            "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1200&q=80"),
        new("Madrid", "Spain", 40.4168, -3.7038,
            "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=1200&q=80"),
        new("Valencia", "Spain", 39.4699, -0.3763,
            "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=1200&q=80"),
        new("Nice", "France", 43.7102, 7.2620,
            "https://images.unsplash.com/photo-1499856871958-5b96275439d0?w=1200&q=80"),
        new("Athens", "Greece", 37.9838, 23.7275,
            "https://images.unsplash.com/photo-1555993539-1732b0258235?w=1200&q=80"),
        new("Budapest", "Hungary", 47.4979, 19.0402,
            "https://images.unsplash.com/photo-1541343674515-bb4461886a55?w=1200&q=80"),
        new("Prague", "Czech Republic", 50.0755, 14.4378,
            "https://images.unsplash.com/photo-1541849542889-b65b193cd3c8?w=1200&q=80"),
        new("Vienna", "Austria", 48.2082, 16.3738,
            "https://images.unsplash.com/photo-1516559828984-fb0d5b8d3efd?w=1200&q=80"),
        new("Amsterdam", "Netherlands", 52.3676, 4.9041,
            "https://images.unsplash.com/photo-1534351590666-13e498efd36d?w=1200&q=80"),
        new("Copenhagen", "Denmark", 55.6761, 12.5683,
            "https://images.unsplash.com/photo-1513622470522-26c3c8ab0d77?w=1200&q=80")
    ];

    public static EuropeanCity? FindByName(string city) =>
        Cities.FirstOrDefault(c => string.Equals(c.Name, city, StringComparison.OrdinalIgnoreCase));
}
