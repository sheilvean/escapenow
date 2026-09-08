using Fixtures.Modules.Alpha.Contracts;
using Fixtures.Modules.Alpha.Internal;

namespace Fixtures.Modules.Beta;

/// <summary>
/// Deliberately wrong: it reaches past Alpha's contract into Alpha's internals. The legal
/// dependency on <see cref="IAlphaService"/> is kept alongside it, so the negative test also
/// proves the rule does not simply flag every cross-module reference.
/// </summary>
public sealed class BoundaryBreaker(IAlphaService legal)
{
    private readonly AlphaInternals _illegal = new();

    public string Describe() => $"{legal.Run()}:{_illegal.Secret()}";
}
