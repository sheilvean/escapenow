using EscapeNow.ArchitectureTests.Support;

namespace EscapeNow.ArchitectureTests;

/// <summary>
/// Module boundaries and registry consistency for the real repository.
///
/// The rules are driven by <c>architecture.modules</c> in <c>project.config.json</c> and by the
/// project-naming convention, so registering a module brings it under these rules without a
/// single test file being edited. The template ships with an empty registry; the rules that need
/// modules report themselves skipped, and the consistency rule — which is what catches a module
/// that was added without being registered — runs either way.
/// </summary>
public sealed class ModuleRegistryTests
{
    private static readonly IReadOnlyList<ModuleRegistration> Registry =
        RepositoryLayout.Config.Architecture.Modules;

    private static string[] ProjectNames() =>
        ProjectGraph
            .Load(RepositoryLayout.SourceDirectory)
            .Select(static n => n.Name)
            .ToArray();

    [Fact]
    public void The_registry_matches_the_module_projects_in_both_directions()
    {
        var projects = ProjectNames();

        // Guard: an empty project list would make the comparison meaningless.
        Assert.NotEmpty(projects);

        var (registeredWithoutProject, projectWithoutRegistration) = ModuleRules.CompareRegistry(
            Registry.Select(static m => m.Name).ToArray(),
            projects,
            RepositoryLayout.Config.SolutionName);

        Assert.True(
            registeredWithoutProject.Count == 0,
            "architecture.modules registers modules that have no project, so the registry " +
            "describes something that does not exist: " +
            string.Join(", ", registeredWithoutProject));

        Assert.True(
            projectWithoutRegistration.Count == 0,
            "These module projects are not in architecture.modules, so they are outside the " +
            "boundary rules entirely: " + string.Join(", ", projectWithoutRegistration) +
            ". Add them to project.config.json.");
    }

    [Fact]
    public void Every_registered_module_declares_a_non_empty_contract()
    {
        Assert.SkipWhen(
            Registry.Count == 0,
            "architecture.modules is empty, so there is no module contract to check. " +
            "The registry consistency rule still runs.");

        Assert.All(Registry, module =>
        {
            Assert.False(string.IsNullOrWhiteSpace(module.Name));
            Assert.False(
                string.IsNullOrWhiteSpace(module.Contract),
                $"Module {module.Name} declares no contract namespace, so every one of its " +
                "types would be reachable from other modules.");
        });
    }

    [Fact]
    public void No_module_reaches_past_another_modules_contract()
    {
        Assert.SkipWhen(
            Registry.Count < 2,
            "Fewer than two modules are registered, so no cross-module dependency is possible. " +
            "ModuleBoundaryRuleTests proves the rule detects the violation it exists for.");

        var solutionName = RepositoryLayout.Config.SolutionName;

        var modules = Registry
            .Select(m => new ModuleRules.Module(
                Name: m.Name,
                RootNamespace: ModuleRules.ProjectNameFor(solutionName, m.Name),
                Contract: m.Contract,
                AssemblyName: ModuleRules.ProjectNameFor(solutionName, m.Name)))
            .ToArray();

        var assemblies = modules
            .Select(static m => System.Reflection.Assembly.Load(m.AssemblyName))
            .ToArray();

        var architecture = ModuleRules.LoadArchitecture(assemblies);

        var violations = ModuleRules.FindBoundaryViolations(architecture, modules);

        Assert.True(
            violations.Count == 0,
            "Cross-module dependencies must go through the target module's declared contract:" +
            Environment.NewLine + string.Join(Environment.NewLine, violations));
    }
}
