using EscapeNow.ArchitectureTests.Support;
using ArchUnitNET.Domain;
using ArchUnitNET.Fluent;
using static ArchUnitNET.Fluent.ArchRuleDefinition;
using ReflectionAssembly = System.Reflection.Assembly;

namespace EscapeNow.ArchitectureTests;

/// <summary>
/// Proof that each rule detects the violation it exists for.
///
/// A rule that passes on correct code tells us nothing on its own: a rule that checks nothing
/// also passes. Each test here points a rule at a fixture built to break it and fails if no
/// violation is reported. That closes the loop the requirements ask for — an agent (or a person)
/// cannot make a red architecture test go green by weakening the rule, because weakening it
/// turns the matching test below red.
///
/// The fixtures live in <c>tests/fixtures/</c> and are never part of the production rule set.
/// </summary>
public sealed class NegativeFixtureTests
{
    private static readonly ReflectionAssembly FixtureDomain =
        ReflectionAssembly.Load("Fixtures.Layers.Domain");

    private static readonly ReflectionAssembly FixtureInfrastructure =
        ReflectionAssembly.Load("Fixtures.Layers.Infrastructure");

    [Fact]
    public void The_layer_direction_rule_detects_a_domain_that_depends_on_infrastructure()
    {
        var architecture = ModuleRules.LoadArchitecture(FixtureDomain, FixtureInfrastructure);

        IObjectProvider<IType> infrastructureTypes = Types().That()
            .ResideInAssembly(FixtureInfrastructure)
            .As("types in the fixture infrastructure");

        var rule = Types().That()
            .ResideInAssembly(FixtureDomain)
            .Should().NotDependOnAny(infrastructureTypes)
            .Because("a domain project must never reference infrastructure");

        RuleGuard.ExpectViolation(
            architecture,
            rule,
            "Domain must not depend on Infrastructure");
    }

    [Fact]
    public void The_framework_leakage_rule_detects_a_domain_that_references_the_web_framework()
    {
        // Same code path as the production rule, pointed at the fixture.
        var violations = AssemblyReferenceRules.FindForbiddenReferences(
            FixtureDomain,
            LayeredProfile.ForbiddenInDomain);

        Assert.NotEmpty(violations);
        Assert.Contains(
            violations,
            v => v.Contains("Microsoft.AspNetCore", StringComparison.Ordinal));
    }

    [Fact]
    public void The_framework_leakage_rule_does_not_fire_on_a_clean_assembly()
    {
        // The complement of the test above: a rule that flags everything is as useless as one
        // that flags nothing.
        var violations = AssemblyReferenceRules.FindForbiddenReferences(
            FixtureInfrastructure,
            LayeredProfile.ForbiddenInDomain);

        Assert.Empty(violations);
    }

    [Fact]
    public void The_project_reference_rule_detects_the_forbidden_edge_the_fixture_declares()
    {
        // Reads the fixture project files, so it also proves the .csproj parser works on real
        // files rather than only on the fabricated graphs used elsewhere.
        var fixtureRoot = Path.Combine(RepositoryLayout.TestDirectory, "fixtures");
        var graph = ProjectGraph.Load(fixtureRoot);

        Assert.NotEmpty(graph);

        // The fixture pair is named Fixtures.Layers.{Layer}, so the same layer mapping applies
        // with "Fixtures.Layers" standing in for the solution name.
        var violations = ProjectGraph.FindForbiddenEdges(
            graph,
            name => LayeredProfile.LayerOf(name, "Fixtures.Layers"),
            LayeredProfile.AllowedReferences);

        Assert.NotEmpty(violations);
        Assert.Contains(
            violations,
            v => v.Contains("Fixtures.Layers.Domain (Domain)", StringComparison.Ordinal));
    }

    [Fact]
    public void ArchUnitNET_itself_rejects_an_empty_selection()
    {
        // Documents the behaviour the pinned version actually has, so an upgrade that removes it
        // fails here rather than quietly making every rule vacuous. Verified against 0.13.4:
        // an empty selection is reported as "The rule requires positive evaluation, not just
        // absence of violations."
        var architecture = ModuleRules.LoadArchitecture(FixtureDomain);

        var emptySelectionRule = Types().That()
            .ResideInNamespace("This.Namespace.Does.Not.Exist")
            .Should().NotDependOnAny(Types().That().ResideInAssembly(FixtureDomain));

        Assert.False(
            emptySelectionRule.HasNoViolations(architecture),
            "ArchUnitNET no longer fails a rule whose selection is empty. RuleGuard's explicit " +
            "non-empty check is now the only thing standing between these tests and passing " +
            "vacuously, so verify it still covers every rule before accepting the upgrade.");
    }

    [Fact]
    public void The_empty_analysis_guard_catches_a_rule_that_opted_out_of_positive_results()
    {
        // WithoutRequiringPositiveResults() is the documented way to switch off ArchUnitNET's own
        // empty-selection protection, which makes it the exact call an agent could add to turn a
        // red rule green while checking nothing. This proves RuleGuard still fails such a rule,
        // so the guard is a real second line of defence rather than a duplicate of the library's.
        var architecture = ModuleRules.LoadArchitecture(FixtureDomain);

        IObjectProvider<IType> nothing = Types().That()
            .ResideInNamespace("This.Namespace.Does.Not.Exist")
            .As("a deliberately empty selection");

        var optedOutRule = Types().That()
            .ResideInNamespace("This.Namespace.Does.Not.Exist")
            .Should().NotDependOnAny(Types().That().ResideInAssembly(FixtureDomain))
            .WithoutRequiringPositiveResults();

        // ArchUnitNET now considers the vacuous rule satisfied...
        Assert.True(
            optedOutRule.HasNoViolations(architecture),
            "Expected WithoutRequiringPositiveResults() to suppress the empty-selection failure.");

        // ...and RuleGuard is what still turns it into a failure.
        var guardFailure = Assert.ThrowsAny<Exception>(
            () => RuleGuard.Check(nothing, optedOutRule, "a deliberately empty selection"));

        Assert.Contains("analysed 0 type(s)", guardFailure.Message, StringComparison.Ordinal);
    }
}

/// <summary>
/// Proof that the module boundary rule detects a module reaching past another's contract, using
/// the fixture module pair. This is also what covers the rule while the template's own registry
/// is empty.
/// </summary>
public sealed class ModuleBoundaryRuleTests
{
    private static readonly ModuleRules.Module Alpha = new(
        Name: "Alpha",
        RootNamespace: "Fixtures.Modules.Alpha",
        Contract: "Contracts",
        AssemblyName: "Fixtures.Modules.Alpha");

    private static readonly ModuleRules.Module Beta = new(
        Name: "Beta",
        RootNamespace: "Fixtures.Modules.Beta",
        Contract: "Contracts",
        AssemblyName: "Fixtures.Modules.Beta");

    private static Architecture FixtureArchitecture() => ModuleRules.LoadArchitecture(
        ReflectionAssembly.Load(Alpha.AssemblyName),
        ReflectionAssembly.Load(Beta.AssemblyName));

    [Fact]
    public void Detects_a_dependency_on_another_modules_internals()
    {
        var violations = ModuleRules.FindBoundaryViolations(FixtureArchitecture(), [Alpha, Beta]);

        Assert.NotEmpty(violations);
        Assert.Contains(
            violations,
            v => v.Contains("Fixtures.Modules.Alpha.Internal.AlphaInternals", StringComparison.Ordinal));
    }

    [Fact]
    public void Does_not_flag_the_legal_dependency_on_the_contract()
    {
        // BoundaryBreaker depends on both IAlphaService (legal) and AlphaInternals (illegal).
        // Only the second may be reported, or the rule would be unusable in practice.
        var violations = ModuleRules.FindBoundaryViolations(FixtureArchitecture(), [Alpha, Beta]);

        Assert.DoesNotContain(
            violations,
            v => v.Contains("Fixtures.Modules.Alpha.Contracts.IAlphaService", StringComparison.Ordinal));
    }

    [Fact]
    public void Reports_nothing_when_the_contract_covers_the_whole_module()
    {
        // Widening Alpha's contract to its root namespace makes every dependency legal. This
        // proves the rule is driven by the registered contract rather than hardcoding a
        // namespace, which is what lets a real project choose its own contract layout.
        var wideAlpha = Alpha with { Contract = string.Empty };

        var violations = ModuleRules.FindBoundaryViolations(
            FixtureArchitecture(),
            [wideAlpha with { Contract = "Contracts" }, Beta]);

        // Sanity check that the narrow contract still reports, so the assertion below is about
        // the widening and not about an accidentally broken fixture.
        Assert.NotEmpty(violations);

        var widened = ModuleRules.FindBoundaryViolations(
            FixtureArchitecture(),
            [new ModuleRules.Module("Alpha", "Fixtures", "Modules.Alpha", "Fixtures.Modules.Alpha"), Beta]);

        Assert.Empty(widened);
    }

    [Fact]
    public void Registry_comparison_reports_both_directions()
    {
        var (registeredWithoutProject, projectWithoutRegistration) = ModuleRules.CompareRegistry(
            registeredModuleNames: ["Alpha", "Ghost"],
            projectNames: ["X.Modules.Alpha", "X.Modules.Stowaway", "X.Domain"],
            solutionName: "X");

        Assert.Contains(
            registeredWithoutProject,
            v => v.Contains("Ghost", StringComparison.Ordinal));
        Assert.Contains("Stowaway", projectWithoutRegistration);
        // A registered module with a matching project is reported in neither direction.
        Assert.DoesNotContain(
            registeredWithoutProject,
            v => v.Contains("Alpha", StringComparison.Ordinal));
        Assert.DoesNotContain("Alpha", projectWithoutRegistration);
    }
}
