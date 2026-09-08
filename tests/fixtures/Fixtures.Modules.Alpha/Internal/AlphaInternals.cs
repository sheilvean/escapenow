namespace Fixtures.Modules.Alpha.Internal;

/// <summary>
/// Public for the CLR, but outside the module's contract. Another module depending on this
/// type is exactly the violation the module boundary rule must report.
/// </summary>
public sealed class AlphaInternals
{
    public string Secret() => "alpha internals";
}
