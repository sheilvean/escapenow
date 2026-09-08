using EscapeNow.Domain.Readiness;

namespace EscapeNow.Application.Abstractions;

/// <summary>
/// Port that reports on the declared external dependencies. A deployment with no
/// dependencies returns an empty collection; that is a valid answer, not a failure.
/// </summary>
public interface IDependencyProbe
{
    ValueTask<IReadOnlyCollection<DependencyReport>> ProbeAsync(CancellationToken cancellationToken);
}
