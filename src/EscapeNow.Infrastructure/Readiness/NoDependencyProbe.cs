using EscapeNow.Application.Abstractions;
using EscapeNow.Domain.Readiness;

namespace EscapeNow.Infrastructure.Readiness;

/// <summary>
/// The probe used when no external dependency is configured. It reports an empty
/// collection, which the domain rule treats as a valid "nothing to check" state.
///
/// This is deliberately not a stub for a future database: enabling persistence means
/// adding a real probe with its own tests, not making this one pretend. See
/// docs/customizing-the-template.md.
/// </summary>
public sealed class NoDependencyProbe : IDependencyProbe
{
    private static readonly IReadOnlyCollection<DependencyReport> None = [];

    public ValueTask<IReadOnlyCollection<DependencyReport>> ProbeAsync(
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult(None);
    }
}
