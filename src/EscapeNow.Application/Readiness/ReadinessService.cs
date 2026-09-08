using EscapeNow.Application.Abstractions;
using EscapeNow.Domain.Readiness;

namespace EscapeNow.Application.Readiness;

/// <summary>
/// Orchestrates the readiness decision: gather the inputs through the ports, then let the
/// domain rule decide. It contains no rule of its own, and no framework type — options are
/// injected as a plain object so this layer stays free of dependency-injection and
/// configuration abstractions, which the architecture tests verify.
/// </summary>
public sealed class ReadinessService(
    IClock clock,
    IProcessStartTime processStartTime,
    IDependencyProbe dependencyProbe,
    ReadinessOptions options)
{
    /// <summary>
    /// Evaluates readiness. A probe that times out or faults is reported as an unavailable
    /// dependency rather than being swallowed: an unknown dependency state must not read as
    /// a healthy one.
    /// </summary>
    public async ValueTask<ReadinessVerdict> EvaluateAsync(CancellationToken cancellationToken)
    {
        var uptime = clock.UtcNow - processStartTime.StartedAtUtc;

        IReadOnlyCollection<DependencyReport> dependencies;
        try
        {
            dependencies = await ProbeWithTimeoutAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The caller gave up; let it observe that rather than inventing a verdict.
            throw;
        }
        catch (OperationCanceledException)
        {
            dependencies = [DependencyReport.Create("dependency-probe", isAvailable: false)];
        }

        return ReadinessVerdict.Evaluate(uptime, options.WarmupPeriod, dependencies);
    }

    private async ValueTask<IReadOnlyCollection<DependencyReport>> ProbeWithTimeoutAsync(
        CancellationToken cancellationToken)
    {
        if (options.ProbeTimeout <= TimeSpan.Zero)
        {
            return await dependencyProbe.ProbeAsync(cancellationToken).ConfigureAwait(false);
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.ProbeTimeout);

        return await dependencyProbe.ProbeAsync(timeout.Token).ConfigureAwait(false);
    }
}
