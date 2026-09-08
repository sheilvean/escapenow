using EscapeNow.Application.Abstractions;

namespace EscapeNow.Infrastructure.Readiness;

/// <summary>Adapter over the machine clock.</summary>
public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
