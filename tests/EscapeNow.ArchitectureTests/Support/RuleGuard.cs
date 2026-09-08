using ArchUnitNET.Domain;
using ArchUnitNET.Fluent;
using ArchUnitNET.xUnitV3;

namespace EscapeNow.ArchitectureTests.Support;

/// <summary>
/// Runs an architecture rule only after proving it has something to analyse.
///
/// ArchUnitNET rules are satisfied vacuously when the selected set is empty: a rule about
/// "types in Domain" passes if no Domain type was loaded. That failure mode is silent and it
/// would make these tests worthless, so every rule in this project goes through here.
/// </summary>
internal static class RuleGuard
{
    /// <summary>
    /// Asserts the selected set is non-empty, then checks the rule.
    /// </summary>
    /// <param name="selection">The types the rule is about.</param>
    /// <param name="rule">The rule to check.</param>
    /// <param name="what">
    /// What the selection is, for the failure message — for example "types in Domain".
    /// </param>
    /// <param name="minimumExpected">
    /// Lowest plausible size of the selection. Defaults to 1; raise it where a selection that
    /// shrank to a single type would itself indicate the rule stopped covering the code.
    /// </param>
    internal static void Check(
        IObjectProvider<IType> selection,
        IArchRule rule,
        string what,
        int minimumExpected = 1)
    {
        var found = selection.GetObjects(ArchitectureFacts.Production).ToArray();

        Assert.True(
            found.Length >= minimumExpected,
            $"The rule about {what} analysed {found.Length} type(s), which is below the expected " +
            $"minimum of {minimumExpected}. An empty or unexpectedly small selection makes the " +
            "rule pass without checking anything, so this is reported as a failure rather than " +
            "a pass. Check the assembly loading and the selection predicate.");

        rule.Check(ArchitectureFacts.Production);
    }

    /// <summary>
    /// Asserts a rule reports at least one violation on the given architecture.
    ///
    /// Used by the negative tests: it is not enough for a rule to pass on correct code, it must
    /// also fail on incorrect code. If a rule is weakened until it stops detecting its fixture,
    /// the call below stops throwing and the negative test fails.
    /// </summary>
    internal static void ExpectViolation(Architecture architecture, IArchRule rule, string what)
    {
        var satisfied = rule.HasNoViolations(architecture);

        Assert.False(
            satisfied,
            $"The rule for {what} reported no violation against a fixture built to violate it. " +
            "Either the fixture no longer contains the violation, or the rule has been weakened " +
            "so that it no longer detects it. Both make the corresponding positive test " +
            "meaningless, so this is a failure.");
    }
}
