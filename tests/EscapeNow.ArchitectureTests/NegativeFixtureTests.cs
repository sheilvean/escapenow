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
        var architecture = ArchitectureLoader.LoadArchitecture(FixtureDomain, FixtureInfrastructure);

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
        var architecture = ArchitectureLoader.LoadArchitecture(FixtureDomain);

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
        var architecture = ArchitectureLoader.LoadArchitecture(FixtureDomain);

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
