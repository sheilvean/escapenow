namespace EscapeNow.Application.Destinations;

public sealed class DuplicateCityNameException()
    : Exception("A city with that name already exists.");
