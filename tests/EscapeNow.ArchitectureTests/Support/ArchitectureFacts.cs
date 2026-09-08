using ArchUnitNET.Domain;
using ArchUnitNET.Loader;

// ArchUnitNET.Domain also defines an Assembly type; alias the reflection one so every
// mention below is unambiguous about which is meant.
using ReflectionAssembly = System.Reflection.Assembly;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// The assemblies under test and the ArchUnitNET model built from them.
///
/// Assemblies are resolved by name from <c>project.config.json</c> — <c>{solutionName}.{Layer}</c>
/// — so no solution or layer name is written into a test, and a renamed application needs no edit.
/// Only production assemblies are loaded here: the negative fixtures are loaded separately by the
/// negative tests, so a deliberate violation in a fixture can never trigger or mask a real finding.
/// </summary>
internal static class ArchitectureFacts
{
    private static readonly Lazy<LoadedAssemblies> Loaded = new(Load, isThreadSafe: true);

    internal static Architecture Production => Loaded.Value.Architecture;

    internal static ReflectionAssembly Domain => Loaded.Value.ByLayer[LayeredProfile.Domain];

    internal static ReflectionAssembly Application => Loaded.Value.ByLayer[LayeredProfile.Application];

    internal static ReflectionAssembly Infrastructure => Loaded.Value.ByLayer[LayeredProfile.Infrastructure];

    internal static ReflectionAssembly Api => Loaded.Value.ByLayer[LayeredProfile.Api];

    /// <summary>Every production assembly, in dependency order.</summary>
    internal static IReadOnlyList<ReflectionAssembly> All => Loaded.Value.Ordered;

    private static LoadedAssemblies Load()
    {
        var solutionName = RepositoryLayout.Config.SolutionName;
        var byLayer = new Dictionary<string, ReflectionAssembly>(StringComparer.Ordinal);
        var missing = new List<string>();

        foreach (var layer in LayeredProfile.Layers)
        {
            var assemblyName = $"{solutionName}.{layer}";
            try
            {
                byLayer[layer] = ReflectionAssembly.Load(assemblyName);
            }
            catch (Exception ex) when (ex is FileNotFoundException or FileLoadException or BadImageFormatException)
            {
                missing.Add($"{assemblyName} ({ex.GetType().Name})");
            }
        }

        // Loading nothing must be a failure. A rule that finds no assembly to analyse would
        // otherwise pass vacuously, which is the most dangerous way for these tests to be green.
        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                "The architecture tests could not load every production assembly, so the rules " +
                "would run against an incomplete set. Missing: " + string.Join(", ", missing) +
                ". Check that the architecture test project references all four layer projects " +
                $"and that they follow the {{solutionName}}.{{Layer}} naming convention " +
                $"(solutionName is \"{solutionName}\").");
        }

        var ordered = LayeredProfile.Layers.Select(l => byLayer[l]).ToArray();

        var architecture = new ArchLoader()
            .LoadAssemblies(ordered)
            .Build();

        if (!architecture.Types.Any())
        {
            throw new InvalidOperationException(
                "ArchUnitNET loaded the production assemblies but found no types. The rules " +
                "would pass without analysing anything.");
        }

        return new LoadedAssemblies(architecture, byLayer, ordered);
    }

    private sealed record LoadedAssemblies(
        Architecture Architecture,
        IReadOnlyDictionary<string, ReflectionAssembly> ByLayer,
        IReadOnlyList<ReflectionAssembly> Ordered);
}
