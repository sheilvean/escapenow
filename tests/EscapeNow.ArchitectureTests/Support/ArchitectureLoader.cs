using ArchUnitNET.Domain;
using ArchUnitNET.Loader;
using ReflectionAssembly = System.Reflection.Assembly;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// Builds the ArchUnitNET model the rules are evaluated against.
///
/// The assemblies are passed in rather than read from a fixed place, so the same loader serves
/// the real solution and the deliberately broken fixtures. An empty model is rejected here
/// because a rule over no types passes without analysing anything, which is the most dangerous
/// way for these tests to be green.
/// </summary>
internal static class ArchitectureLoader
{
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
