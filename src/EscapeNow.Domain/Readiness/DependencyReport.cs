namespace EscapeNow.Domain.Readiness;

/// <summary>
/// What one declared dependency reported about itself.
/// </summary>
/// <param name="Name">Stable identifier of the dependency, used in diagnostics.</param>
/// <param name="IsAvailable">Whether the dependency answered successfully.</param>
public sealed record DependencyReport(string Name, bool IsAvailable)
{
    /// <summary>
    /// Creates a report, rejecting a name that cannot identify anything.
    /// </summary>
    public static DependencyReport Create(string name, bool isAvailable)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("A dependency report needs a non-empty name.", nameof(name));
        }

        return new DependencyReport(name.Trim(), isAvailable);
    }
}
