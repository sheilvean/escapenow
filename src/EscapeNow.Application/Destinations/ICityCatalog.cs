using EscapeNow.Domain.Destinations;

namespace EscapeNow.Application.Destinations;

public interface ICityCatalog
{
    Task<IReadOnlyList<EuropeanCity>> ListAsync(CancellationToken cancellationToken = default);

    Task<EuropeanCity?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<EuropeanCity?> FindByNameAsync(string name, CancellationToken cancellationToken = default);

    Task AddAsync(EuropeanCity city, CancellationToken cancellationToken = default);

    Task UpdateAsync(EuropeanCity city, CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
