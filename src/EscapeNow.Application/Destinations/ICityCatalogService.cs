using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public interface ICityCatalogService
{
    Task<IReadOnlyList<EuropeanCity>> ListAsync(CancellationToken cancellationToken = default);

    Task<EuropeanCity?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task<CityMutationResult> CreateAsync(
        CityWriteRequest request,
        CancellationToken cancellationToken = default);

    Task<CityMutationResult> ReplaceAsync(
        Guid id,
        CityWriteRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
