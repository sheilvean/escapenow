using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace EscapeNow.Api;

/// <summary>
/// Opens a connection and runs <c>SELECT 1</c>. Mapped only onto <c>/health/ready</c>, so a down
/// database does not make an orchestrator restart a healthy process.
/// </summary>
internal sealed class PostgresHealthCheck(string connectionString) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = new NpgsqlCommand("SELECT 1", connection);
            _ = await command.ExecuteScalarAsync(cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The exception message is enough to diagnose; the connection string is not repeated
            // because it carries the demo credential.
            return HealthCheckResult.Unhealthy("PostgreSQL is not reachable.", exception);
        }
    }
}
