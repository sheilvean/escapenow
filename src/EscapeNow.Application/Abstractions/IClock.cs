namespace EscapeNow.Application.Abstractions;

/// <summary>
/// Port for reading the current instant. Implemented by Infrastructure so that
/// Application logic stays testable without waiting for real time to pass.
/// </summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}
