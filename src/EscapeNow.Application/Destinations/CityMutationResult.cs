using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public abstract record CityMutationResult
{
    private CityMutationResult()
    {
    }

    public sealed record Succeeded(EuropeanCity City) : CityMutationResult;

    public sealed record Invalid(string Detail) : CityMutationResult;

    public sealed record DuplicateName : CityMutationResult;

    public sealed record NotFound : CityMutationResult;
}
