namespace EscapeNow.Application.Abstractions;

/// <summary>
/// Port exposing when the current process started. Kept separate from <see cref="IClock"/>
/// because a test needs to control the two independently.
/// </summary>
public interface IProcessStartTime
{
    DateTimeOffset StartedAtUtc { get; }
}
