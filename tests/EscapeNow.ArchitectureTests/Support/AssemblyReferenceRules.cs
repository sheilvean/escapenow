using System.Text.RegularExpressions;
using ReflectionAssembly = System.Reflection.Assembly;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// Framework leakage, checked against an assembly's compiled reference list.
///
/// This does not go through ArchUnitNET on purpose. ArchUnitNET reasons about the assemblies it
/// was given, so a rule phrased as "no type in Domain may depend on a type in
/// Microsoft.AspNetCore.*" selects from a set that was never loaded — it would be satisfied
/// vacuously and report success while checking nothing. The metadata reference list is what the
/// compiler actually emitted, so a forbidden dependency cannot hide from it.
/// </summary>
internal static class AssemblyReferenceRules
{
    /// <summary>
    /// Referenced assembly names that match one of the forbidden patterns.
    /// </summary>
    /// <param name="assembly">The assembly to inspect.</param>
    /// <param name="forbidden">Regular expressions matched against referenced assembly names.</param>
    internal static IReadOnlyList<string> FindForbiddenReferences(
        ReflectionAssembly assembly,
        IReadOnlyList<(string Pattern, string Reason)> forbidden)
    {
        var references = ReferencedNames(assembly);

        var violations = new List<string>();
        foreach (var (pattern, reason) in forbidden)
        {
            var regex = new Regex(pattern, RegexOptions.CultureInvariant, TimeSpan.FromSeconds(2));

            foreach (var reference in references.Where(r => regex.IsMatch(r)))
            {
                violations.Add($"{assembly.GetName().Name} references {reference}. {reason}");
            }
        }

        return violations;
    }

    /// <summary>
    /// The assembly's referenced assembly names.
    /// </summary>
    /// <remarks>
    /// Throws when the list is empty. Every managed assembly references at least the runtime, so
    /// an empty list means the reference list could not be read — and a rule that then reported
    /// "no forbidden references found" would be reporting on nothing.
    /// </remarks>
    internal static IReadOnlyList<string> ReferencedNames(ReflectionAssembly assembly)
    {
        var references = assembly
            .GetReferencedAssemblies()
            .Select(static a => a.Name ?? string.Empty)
            .Where(static n => n.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();

        if (references.Length == 0)
        {
            throw new InvalidOperationException(
                $"{assembly.GetName().Name} reported no referenced assemblies. Every managed " +
                "assembly references the runtime, so this means the reference list could not be " +
                "read and the rule would check nothing.");
        }

        return references;
    }
}
