namespace Fixtures.Modules.Alpha.Contracts;

/// <summary>The only surface another module is allowed to depend on.</summary>
public interface IAlphaService
{
    string Run();
}
