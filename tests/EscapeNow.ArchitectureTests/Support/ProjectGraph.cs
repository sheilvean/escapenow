using System.Xml.Linq;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// The project reference graph, parsed from the project files.
///
/// This exists because assembly analysis cannot see a <c>ProjectReference</c> that no code
/// uses: the compiler simply omits the reference from the output. A declared-but-unused
/// forbidden edge is still a forbidden edge — it is documentation of intent, and the next
/// commit can start using it — so the rules check the declared graph as well as the compiled one.
///
/// Every method here is a pure function over its inputs, so the same code is exercised against
/// the real repository and against fabricated graphs in the negative tests.
/// </summary>
internal static class ProjectGraph
{
    /// <summary>One project and the projects it declares a reference to.</summary>
    internal sealed record Node(string Name, string Path, IReadOnlyList<string> References);

    /// <summary>
    /// Reads every <c>*.csproj</c> under the given directories and resolves its
    /// <c>ProjectReference</c> entries to project names.
    /// </summary>
    internal static IReadOnlyList<Node> Load(params string[] directories)
    {
        var nodes = new List<Node>();

        foreach (var directory in directories)
        {
            if (!Directory.Exists(directory))
            {
                continue;
            }

            foreach (var file in Directory.EnumerateFiles(directory, "*.csproj", SearchOption.AllDirectories))
            {
                nodes.Add(new Node(
                    Name: Path.GetFileNameWithoutExtension(file),
                    Path: file,
                    References: ParseReferences(file)));
            }
        }

        return nodes;
    }

    private static string[] ParseReferences(string projectFile)
    {
        var document = XDocument.Load(projectFile);

        return document
            .Descendants()
            .Where(static e => e.Name.LocalName == "ProjectReference")
            .Select(static e => e.Attribute("Include")?.Value)
            .Where(static v => !string.IsNullOrWhiteSpace(v))
            .Select(static v => Path.GetFileNameWithoutExtension(v!.Replace('\\', '/')))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();
    }

    /// <summary>
    /// Every dependency cycle in the graph, each returned as the path that closes it.
    /// An empty result means the graph is acyclic.
    /// </summary>
    internal static IReadOnlyList<IReadOnlyList<string>> FindCycles(IReadOnlyList<Node> nodes)
    {
        var edges = nodes.ToDictionary(
            static n => n.Name,
            static n => n.References,
            StringComparer.Ordinal);

        var cycles = new List<IReadOnlyList<string>>();
        var state = new Dictionary<string, VisitState>(StringComparer.Ordinal);
        var stack = new List<string>();

        foreach (var node in nodes)
        {
            Visit(node.Name);
        }

        return cycles;

        void Visit(string name)
        {
            if (state.TryGetValue(name, out var visited))
            {
                if (visited == VisitState.InProgress)
                {
                    // Report the cycle from where it starts, so the message is readable.
                    var start = stack.LastIndexOf(name);
                    var cycle = stack.Skip(start).Append(name).ToArray();
                    cycles.Add(cycle);
                }

                return;
            }

            state[name] = VisitState.InProgress;
            stack.Add(name);

            if (edges.TryGetValue(name, out var references))
            {
                foreach (var reference in references)
                {
                    Visit(reference);
                }
            }

            stack.RemoveAt(stack.Count - 1);
            state[name] = VisitState.Done;
        }
    }

    /// <summary>
    /// Edges that the given policy does not permit.
    /// </summary>
    /// <param name="nodes">The graph to inspect.</param>
    /// <param name="layerOf">
    /// Maps a project name to a layer name, or null when the project is outside the policy.
    /// </param>
    /// <param name="allowed">Layer name to the layers it may depend on.</param>
    internal static IReadOnlyList<string> FindForbiddenEdges(
        IReadOnlyList<Node> nodes,
        Func<string, string?> layerOf,
        IReadOnlyDictionary<string, IReadOnlySet<string>> allowed)
    {
        var violations = new List<string>();

        foreach (var node in nodes)
        {
            var fromLayer = layerOf(node.Name);
            if (fromLayer is null || !allowed.TryGetValue(fromLayer, out var permitted))
            {
                continue;
            }

            foreach (var reference in node.References)
            {
                var toLayer = layerOf(reference);
                if (toLayer is null || permitted.Contains(toLayer))
                {
                    continue;
                }

                violations.Add(
                    $"{node.Name} ({fromLayer}) declares a ProjectReference to {reference} ({toLayer}); " +
                    $"{fromLayer} may only reference: {(permitted.Count == 0 ? "nothing" : string.Join(", ", permitted.Order(StringComparer.Ordinal)))}.");
            }
        }

        return violations;
    }

    private enum VisitState
    {
        InProgress,
        Done,
    }
}
