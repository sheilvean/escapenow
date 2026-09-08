namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// The <c>layered</c> profile: which layers exist and which may reference which.
///
/// This is the one place the direction is written down. Both the assembly-level rules and the
/// project-reference rules read it, so the two cannot disagree about the policy. Changing it
/// changes the architecture, which is why <c>docs/adr/</c> and CONTRIBUTING require an argued
/// change rather than an edit that makes a red test go green.
/// </summary>
internal static class LayeredProfile
{
    internal const string Domain = "Domain";
    internal const string Application = "Application";
    internal const string Infrastructure = "Infrastructure";
    internal const string Api = "Api";

    /// <summary>Layer names in dependency order, innermost first.</summary>
    internal static readonly string[] Layers = [Domain, Application, Infrastructure, Api];

    /// <summary>What each layer may reference. Domain references nothing in the solution.</summary>
    internal static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> AllowedReferences =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.Ordinal)
        {
            [Domain] = new HashSet<string>(StringComparer.Ordinal),
            [Application] = new HashSet<string>(StringComparer.Ordinal) { Domain },
            [Infrastructure] = new HashSet<string>(StringComparer.Ordinal) { Domain, Application },
            [Api] = new HashSet<string>(StringComparer.Ordinal) { Domain, Application, Infrastructure },
        };

    /// <summary>
    /// Namespace patterns Domain must stay free of. Domain is where the rules live, so it must
    /// be usable — and unit-testable — without a web server, an ORM or a host.
    /// </summary>
    internal static readonly (string Pattern, string Reason)[] ForbiddenInDomain =
    [
        ("^Microsoft\\.AspNetCore\\..*", "Domain must not depend on the web framework."),
        ("^Microsoft\\.EntityFrameworkCore\\..*", "Domain must not depend on an ORM."),
        ("^Microsoft\\.Extensions\\.Hosting\\..*", "Domain must not depend on the hosting model."),
        ("^Microsoft\\.Extensions\\.DependencyInjection\\..*",
            "Domain must not depend on a dependency-injection container."),
        ("^Microsoft\\.Extensions\\.Configuration\\..*",
            "Domain must not read configuration; values are passed in."),
        ("^System\\.Net\\.Http\\..*", "Domain must not perform HTTP calls; that is a port."),
        ("^System\\.Data\\..*", "Domain must not talk to a database; that is a port."),
    ];

    /// <summary>
    /// Namespace patterns Application must stay free of. Application orchestrates through the
    /// ports it declares, so it needs neither a container nor the configuration abstractions:
    /// the composition root unwraps those before calling in.
    /// </summary>
    internal static readonly (string Pattern, string Reason)[] ForbiddenInApplication =
    [
        ("^Microsoft\\.AspNetCore\\..*", "Application must not depend on the web framework."),
        ("^Microsoft\\.EntityFrameworkCore\\..*", "Application must not depend on an ORM."),
        ("^Microsoft\\.Extensions\\.DependencyInjection\\..*",
            "Application must not depend on a dependency-injection container."),
        ("^Microsoft\\.Extensions\\.Options\\..*",
            "Application takes options as plain objects; unwrapping IOptions is the host's job."),
        ("^Microsoft\\.Extensions\\.Configuration\\..*",
            "Application must not read configuration directly."),
    ];

    /// <summary>
    /// Maps a project or assembly name to its layer, using the <c>{solutionName}.{Layer}</c>
    /// convention. Returns null for anything outside the profile — test projects, fixtures and
    /// module projects — so the rule ignores them rather than guessing.
    /// </summary>
    internal static string? LayerOf(string projectName, string solutionName)
    {
        foreach (var layer in Layers)
        {
            if (string.Equals(projectName, $"{solutionName}.{layer}", StringComparison.Ordinal))
            {
                return layer;
            }
        }

        return null;
    }
}
