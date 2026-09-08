using Fixtures.Layers.Infrastructure;
using Microsoft.AspNetCore.Http;

namespace Fixtures.Layers.Domain;

/// <summary>
/// Deliberately wrong: a domain type reaching for an infrastructure adapter and for an
/// HTTP abstraction. Both are what the negative architecture tests expect to be reported.
/// </summary>
public sealed class LeakyEntity
{
    private readonly PersistenceAdapter _adapter = new();

    public string Describe(HttpContext context) => $"{_adapter.Describe()}:{context.TraceIdentifier}";
}
