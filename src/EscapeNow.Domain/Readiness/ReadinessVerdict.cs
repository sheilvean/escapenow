namespace EscapeNow.Domain.Readiness;

/// <summary>
/// Whether the process should be receiving traffic.
/// </summary>
public enum ReadinessState
{
    /// <summary>Still inside its warm-up window; not yet accepting traffic.</summary>
    Warming,

    /// <summary>Warm, and every declared dependency answered.</summary>
    Ready,

    /// <summary>At least one declared dependency did not answer.</summary>
    Degraded,
}

/// <summary>
/// The readiness decision and the reason behind it.
/// </summary>
/// <remarks>
/// This is the template's one piece of real business logic, and it lives here on purpose:
/// endpoints and the composition root must not decide it. The architecture tests enforce
/// that, and the unit tests cover the edge cases the rule has to get right.
/// </remarks>
public sealed record ReadinessVerdict(ReadinessState State, string Reason)
{
    /// <summary>
    /// Decides readiness from the process uptime and what the declared dependencies reported.
    /// </summary>
    /// <param name="uptime">
    /// How long the process has been running. A negative value means the caller's clock moved
    /// backwards; the rule treats that as "not yet warm" rather than trusting it.
    /// </param>
    /// <param name="warmupPeriod">
    /// How long the process is allowed to warm up. Zero means readiness is decided immediately.
    /// A negative value is a configuration error.
    /// </param>
    /// <param name="dependencies">
    /// Reports from declared dependencies. An empty collection means none are configured, which
    /// is a valid state and does not by itself make the process degraded.
    /// </param>
    public static ReadinessVerdict Evaluate(
        TimeSpan uptime,
        TimeSpan warmupPeriod,
        IReadOnlyCollection<DependencyReport> dependencies)
    {
        ArgumentNullException.ThrowIfNull(dependencies);

        if (warmupPeriod < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(
                nameof(warmupPeriod),
                warmupPeriod,
                "The warm-up period cannot be negative.");
        }

        if (uptime < TimeSpan.Zero)
        {
            return new ReadinessVerdict(
                ReadinessState.Warming,
                "Reported uptime is negative, so the process is not treated as warm.");
        }

        if (uptime < warmupPeriod)
        {
            return new ReadinessVerdict(
                ReadinessState.Warming,
                $"Warming up: {uptime.TotalSeconds:0.###}s of {warmupPeriod.TotalSeconds:0.###}s elapsed.");
        }

        var unavailable = dependencies
            .Where(static d => !d.IsAvailable)
            .Select(static d => d.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();

        if (unavailable.Length > 0)
        {
            return new ReadinessVerdict(
                ReadinessState.Degraded,
                $"Unavailable dependencies: {string.Join(", ", unavailable)}.");
        }

        return new ReadinessVerdict(
            ReadinessState.Ready,
            dependencies.Count == 0
                ? "Warm, with no dependencies configured."
                : $"Warm, with all {dependencies.Count} dependencies available.");
    }
}
