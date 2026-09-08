using System.Text.Json;
using System.Text.Json.Serialization;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// Locates the repository and reads the parts of <c>project.config.json</c> the architecture
/// rules are driven by. Nothing here hardcodes a solution or module name, so a renamed
/// application and a newly registered module need no test edit.
/// </summary>
internal static class RepositoryLayout
{
    private const string ConfigFileName = "project.config.json";

    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    /// <summary>The repository root, found by walking up from the test assembly's location.</summary>
    internal static string Root { get; } = FindRoot();

    /// <summary>The configuration that drives the rules.</summary>
    internal static ProjectConfig Config { get; } = ReadConfig(Root);

    internal static string SourceDirectory => Path.Combine(Root, Config.Paths.Src);

    internal static string TestDirectory => Path.Combine(Root, Config.Paths.Tests);

    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, ConfigFileName)))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new InvalidOperationException(
            $"Could not locate {ConfigFileName} above {AppContext.BaseDirectory}. " +
            "The architecture tests must run from inside the repository.");
    }

    private static ProjectConfig ReadConfig(string root)
    {
        var path = Path.Combine(root, ConfigFileName);
        var json = File.ReadAllText(path);

        var config = JsonSerializer.Deserialize<ProjectConfig>(json, JsonOptions);

        // A configuration we cannot read is an error. Falling back to defaults here would let
        // the rules run against assumptions instead of the repository's actual policy.
        return config
            ?? throw new InvalidOperationException($"{path} deserialized to null.");
    }
}

internal sealed record ProjectConfig
{
    [JsonPropertyName("solutionName")]
    public required string SolutionName { get; init; }

    [JsonPropertyName("rootNamespace")]
    public required string RootNamespace { get; init; }

    [JsonPropertyName("paths")]
    public required ProjectPaths Paths { get; init; }

    [JsonPropertyName("architecture")]
    public required ArchitectureConfig Architecture { get; init; }
}

internal sealed record ProjectPaths
{
    [JsonPropertyName("src")]
    public required string Src { get; init; }

    [JsonPropertyName("tests")]
    public required string Tests { get; init; }
}

internal sealed record ArchitectureConfig
{
    [JsonPropertyName("profile")]
    public required string Profile { get; init; }
}

/// <summary>The architecture profiles the rules know how to enforce.</summary>
internal static class ArchitectureProfiles
{
    internal const string Layered = "layered";
    internal const string Custom = "custom";

    /// <summary>
    /// Whether the layer-direction rules apply. Under <c>custom</c> they report themselves not
    /// applicable, while the dependency-cycle rules keep running: an acyclic graph is an
    /// invariant of any profile, not of this one.
    /// </summary>
    internal static bool LayerRulesApply =>
        RepositoryLayout.Config.Architecture.Profile == Layered;
}
