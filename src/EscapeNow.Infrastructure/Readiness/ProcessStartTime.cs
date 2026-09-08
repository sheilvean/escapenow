using System.Diagnostics;
using EscapeNow.Application.Abstractions;

namespace EscapeNow.Infrastructure.Readiness;

/// <summary>
/// Adapter over the current process's start time. Captured once, because the value
/// cannot change while the process lives.
/// </summary>
public sealed class ProcessStartTime : IProcessStartTime
{
    public ProcessStartTime()
    {
        using var current = Process.GetCurrentProcess();
        StartedAtUtc = new DateTimeOffset(current.StartTime.ToUniversalTime(), TimeSpan.Zero);
    }

    public DateTimeOffset StartedAtUtc { get; }
}
