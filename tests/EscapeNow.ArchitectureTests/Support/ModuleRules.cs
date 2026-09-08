using ArchUnitNET.Domain;
using ArchUnitNET.Loader;
using ReflectionAssembly = System.Reflection.Assembly;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// Module boundary and registry rules.
///
/// Every method takes the module set as an argument rather than reading it from a fixed place,
/// so the exact same code judges the real repository and the deliberately broken fixtures. That
/// is what makes the negative tests meaningful: weakening a rule to make a real failure go away
/// also stops it detecting its fixture, and the negative test turns red.
/// </summary>
internal static class ModuleRules
{
    /// <summary>
    /// One module under analysis.
    /// </summary>
    /// <param name="Name">Module name as registered.</param>
    /// <param name="RootNamespace">Namespace the module's own types live under.</param>
    /// <param name="Contract">
    /// Namespace suffix, relative to <paramref name="RootNamespace"/>, that other modules may
    /// depend on. Everything else in the module is internal to it.
    /// </param>
    /// <param name="AssemblyName">Assembly the module compiles to.</param>
    internal sealed record Module(
        string Name,
        string RootNamespace,
        string Contract,
        string AssemblyName)
    {
        internal string ContractNamespace => $"{RootNamespace}.{Contract}";
    }

    /// <summary>Project-name convention for a registered module.</summary>
    internal static string ProjectNameFor(string solutionName, string moduleName) =>
        $"{solutionName}.Modules.{moduleName}";

    /// <summary>
    /// Cross-module dependencies that bypass the target module's contract.
    /// </summary>
    /// <remarks>
    /// A dependency from module A on module B is permitted only when the target type lives under
    /// B's contract namespace. Reaching a type that is public to the CLR but outside the contract
    /// is exactly the coupling module boundaries exist to prevent, and it is invisible to a rule
    /// that only looks at accessibility.
    /// </remarks>
    internal static IReadOnlyList<string> FindBoundaryViolations(
        Architecture architecture,
        IReadOnlyList<Module> modules)
    {
        var byAssembly = modules.ToDictionary(
            static m => m.AssemblyName,
            static m => m,
            StringComparer.Ordinal);

        var violations = new List<string>();

        foreach (var type in architecture.Types)
        {
            if (type.IsCompilerGenerated || type.IsStub)
            {
                continue;
            }

            if (!byAssembly.TryGetValue(type.Assembly.Name, out var origin))
            {
                continue;
            }

            foreach (var dependency in type.Dependencies)
            {
                var target = dependency.Target;

                if (!byAssembly.TryGetValue(target.Assembly.Name, out var targetModule))
                {
                    continue;
                }

                // A module depending on itself is not a boundary crossing.
                if (ReferenceEquals(targetModule, origin))
                {
                    continue;
                }

                var targetNamespace = target.Namespace.FullName ?? string.Empty;
                var contract = targetModule.ContractNamespace;

                var withinContract =
                    targetNamespace.Equals(contract, StringComparison.Ordinal)
                    || targetNamespace.StartsWith(contract + ".", StringComparison.Ordinal);

                if (withinContract)
                {
                    continue;
                }

                violations.Add(
                    $"{type.FullName} (module {origin.Name}) depends on {target.FullName} " +
                    $"(module {targetModule.Name}), which is outside {targetModule.Name}'s " +
                    $"contract namespace {contract}.");
            }
        }

        return violations.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
    }

    /// <summary>
    /// Compares the registry against the module projects actually present.
    /// </summary>
    /// <returns>
    /// Registered modules with no project, and module projects that are not registered. Both
    /// directions matter: the first means the registry describes something that does not exist,
    /// the second means a module escaped the rules entirely.
    /// </returns>
    internal static (IReadOnlyList<string> RegisteredWithoutProject,
        IReadOnlyList<string> ProjectWithoutRegistration) CompareRegistry(
            IReadOnlyList<string> registeredModuleNames,
            IReadOnlyList<string> projectNames,
            string solutionName)
    {
        var projects = new HashSet<string>(projectNames, StringComparer.Ordinal);
        var modulePrefix = $"{solutionName}.Modules.";

        var registeredWithoutProject = registeredModuleNames
            .Where(name => !projects.Contains(ProjectNameFor(solutionName, name)))
            .Select(name => $"{name} (expected project {ProjectNameFor(solutionName, name)})")
            .Order(StringComparer.Ordinal)
            .ToArray();

        var registered = new HashSet<string>(registeredModuleNames, StringComparer.Ordinal);

        var projectWithoutRegistration = projectNames
            .Where(p => p.StartsWith(modulePrefix, StringComparison.Ordinal))
            .Select(p => p[modulePrefix.Length..])
            // A module split into sub-projects registers under its first segment.
            .Select(static suffix => suffix.Split('.')[0])
            .Distinct(StringComparer.Ordinal)
            .Where(name => !registered.Contains(name))
            .Order(StringComparer.Ordinal)
            .ToArray();

        return (registeredWithoutProject, projectWithoutRegistration);
    }

    /// <summary>
    /// Builds an ArchUnitNET model over the given assemblies, failing if it is empty.
    /// </summary>
    internal static Architecture LoadArchitecture(params ReflectionAssembly[] assemblies)
    {
        if (assemblies.Length == 0)
        {
            throw new ArgumentException("No assembly to analyse.", nameof(assemblies));
        }

        var architecture = new ArchLoader().LoadAssemblies(assemblies).Build();

        if (!architecture.Types.Any())
        {
            throw new InvalidOperationException(
                "The loaded assemblies contain no types, so any rule over them would pass " +
                "without analysing anything: " +
                string.Join(", ", assemblies.Select(static a => a.GetName().Name)));
        }

        return architecture;
    }
}
