using EscapeNow.ArchitectureTests.Support;

namespace EscapeNow.ArchitectureTests;

/// <summary>
/// Rules over the declared project reference graph.
///
/// Assembly analysis cannot see a <c>ProjectReference</c> that no code uses — the compiler omits
/// it from the output — so a forbidden edge can be added today and used tomorrow without any
/// assembly-level rule noticing. These tests read the project files themselves.
///
/// The cycle rule runs under every profile: an acyclic dependency graph is an invariant of any
/// architecture, not a property of the layered one.
/// </summary>
public sealed class ProjectReferenceRulesTests
{
    private static readonly IReadOnlyList<ProjectGraph.Node> ProductionGraph =
        ProjectGraph.Load(RepositoryLayout.SourceDirectory);

    private static readonly IReadOnlyList<ProjectGraph.Node> WholeGraph =
        ProjectGraph.Load(RepositoryLayout.SourceDirectory, RepositoryLayout.TestDirectory);

    [Fact]
    public void The_graph_is_not_empty()
    {
        // Guard for every rule below: an empty graph would satisfy all of them.
        Assert.True(
            ProductionGraph.Count >= LayeredProfile.Layers.Length,
            $"Expected at least {LayeredProfile.Layers.Length} production projects under " +
            $"{RepositoryLayout.SourceDirectory}, found {ProductionGraph.Count}. The rules below " +
            "would pass without checking anything.");

        Assert.All(ProductionGraph, node => Assert.NotEmpty(node.Name));
    }

    [Fact]
    public void No_project_declares_a_reference_the_profile_forbids()
    {
        Assert.SkipUnless(
            ArchitectureProfiles.LayerRulesApply,
            "architecture.profile is not \"layered\", so layer-direction edges are not " +
            "constrained. The cycle rule below still runs.");

        var solutionName = RepositoryLayout.Config.SolutionName;

        var violations = ProjectGraph.FindForbiddenEdges(
            ProductionGraph,
            name => LayeredProfile.LayerOf(name, solutionName),
            LayeredProfile.AllowedReferences);

        Assert.True(
            violations.Count == 0,
            "The declared project reference graph violates the layered profile:" +
            Environment.NewLine + string.Join(Environment.NewLine, violations));
    }

    [Fact]
    public void The_whole_repository_graph_is_free_of_cycles()
    {
        // Includes the test and fixture projects: a cycle anywhere makes the build order
        // undefined and the dependency direction unenforceable.
        Assert.NotEmpty(WholeGraph);

        var cycles = ProjectGraph.FindCycles(WholeGraph);

        Assert.True(
            cycles.Count == 0,
            "The project reference graph contains cycles:" + Environment.NewLine +
            string.Join(
                Environment.NewLine,
                cycles.Select(static c => "  " + string.Join(" -> ", c))));
    }

    [Fact]
    public void Every_expected_layer_is_present_exactly_once()
    {
        Assert.SkipUnless(
            ArchitectureProfiles.LayerRulesApply,
            "architecture.profile is not \"layered\", so the layer set is not prescribed.");

        var solutionName = RepositoryLayout.Config.SolutionName;

        foreach (var layer in LayeredProfile.Layers)
        {
            var matches = ProductionGraph
                .Where(n => LayeredProfile.LayerOf(n.Name, solutionName) == layer)
                .ToArray();

            Assert.True(
                matches.Length == 1,
                $"Expected exactly one project for layer {layer} " +
                $"(named {solutionName}.{layer}), found {matches.Length}. Without it, the rules " +
                "for that layer would have nothing to check.");
        }
    }
}

/// <summary>
/// The graph algorithms themselves, against fabricated graphs.
///
/// A project reference cycle cannot exist as a fixture on disk: MSBuild refuses to build one, so
/// the repository could not compile. The detector is therefore proven here on in-memory graphs,
/// and separately applied to the real graph above. Without these tests, "no cycles found" would
/// be indistinguishable from "the detector does not work".
/// </summary>
public sealed class ProjectGraphAlgorithmTests
{
    [Fact]
    public void Detects_a_direct_cycle()
    {
        var cycles = ProjectGraph.FindCycles([
            Node("A", "B"),
            Node("B", "A"),
        ]);

        Assert.NotEmpty(cycles);
    }

    [Fact]
    public void Detects_an_indirect_cycle_and_reports_its_path()
    {
        var cycles = ProjectGraph.FindCycles([
            Node("A", "B"),
            Node("B", "C"),
            Node("C", "A"),
        ]);

        var reported = Assert.Single(cycles);
        Assert.Equal(["A", "B", "C", "A"], reported);
    }

    [Fact]
    public void Detects_a_self_reference()
    {
        var cycles = ProjectGraph.FindCycles([Node("A", "A")]);

        Assert.NotEmpty(cycles);
    }

    [Fact]
    public void Accepts_a_diamond_which_is_not_a_cycle()
    {
        // Two paths to the same node is normal; only a path back to an ancestor is a cycle.
        var cycles = ProjectGraph.FindCycles([
            Node("Api", "Application", "Infrastructure"),
            Node("Infrastructure", "Application"),
            Node("Application", "Domain"),
            Node("Domain"),
        ]);

        Assert.Empty(cycles);
    }

    [Fact]
    public void Tolerates_a_reference_to_a_project_outside_the_scanned_set()
    {
        // Scanning only src/ means references to test helpers resolve to nothing. That must not
        // crash or be mistaken for a cycle.
        var cycles = ProjectGraph.FindCycles([Node("A", "NotScanned")]);

        Assert.Empty(cycles);
    }

    [Fact]
    public void Reports_the_forbidden_edge_including_the_layer_it_points_at()
    {
        var violations = ProjectGraph.FindForbiddenEdges(
            [Node("X.Domain", "X.Infrastructure"), Node("X.Infrastructure")],
            name => LayeredProfile.LayerOf(name, "X"),
            LayeredProfile.AllowedReferences);

        var message = Assert.Single(violations);
        Assert.Contains("X.Domain (Domain)", message, StringComparison.Ordinal);
        Assert.Contains("X.Infrastructure (Infrastructure)", message, StringComparison.Ordinal);
        Assert.Contains("may only reference: nothing", message, StringComparison.Ordinal);
    }

    [Fact]
    public void Ignores_edges_to_projects_outside_the_profile()
    {
        // A layer project referencing an analyzer or a shared build helper is not a layer
        // violation; the rule must not invent one.
        var violations = ProjectGraph.FindForbiddenEdges(
            [Node("X.Domain", "SomeSharedTooling")],
            name => LayeredProfile.LayerOf(name, "X"),
            LayeredProfile.AllowedReferences);

        Assert.Empty(violations);
    }

    private static ProjectGraph.Node Node(string name, params string[] references) =>
        new(name, $"/fabricated/{name}.csproj", references);
}
