namespace EscapeNow.Application.Readiness;

/// <summary>
/// Configuration for the readiness decision, bound from the "Readiness" configuration
/// section by the host.
/// </summary>
public sealed class ReadinessOptions
{
    /// <summary>Configuration section this class binds to.</summary>
    public const string SectionName = "Readiness";

    /// <summary>
    /// How long the process is allowed to warm up before it reports itself ready.
    /// Defaults to zero, so a template with no configuration is ready immediately.
    /// </summary>
    public TimeSpan WarmupPeriod { get; set; } = TimeSpan.Zero;

    /// <summary>
    /// How long a dependency probe may take before readiness is answered without it.
    /// </summary>
    public TimeSpan ProbeTimeout { get; set; } = TimeSpan.FromSeconds(2);
}
