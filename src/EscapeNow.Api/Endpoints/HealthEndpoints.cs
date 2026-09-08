using EscapeNow.Application.Readiness;
using EscapeNow.Domain.Readiness;

namespace EscapeNow.Api.Endpoints;

/// <summary>
/// Health endpoints. These map HTTP to the application service and back; they hold no
/// rule of their own. The architecture tests check that no endpoint type references the
/// domain rule directly.
/// </summary>
internal static class HealthEndpoints
{
    internal static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        // Liveness answers "is the process running", so it must not depend on anything that
        // can be slow or unavailable. An orchestrator restarts the process when this fails.
        endpoints.MapGet("/health/live", static () => Results.Ok(new { status = "alive" }))
            .WithName("Liveness")
            .WithSummary("Reports whether the process is running.");

        endpoints.MapGet(
                "/health/ready",
                static async (ReadinessService readiness, CancellationToken cancellationToken) =>
                {
                    var verdict = await readiness.EvaluateAsync(cancellationToken);

                    var payload = new ReadinessResponse(verdict.State.ToString(), verdict.Reason);

                    // A process that is not ready must not answer 200: a load balancer reads
                    // the status code, not the body.
                    return verdict.State == ReadinessState.Ready
                        ? Results.Ok(payload)
                        : Results.Json(payload, statusCode: StatusCodes.Status503ServiceUnavailable);
                })
            .WithName("Readiness")
            .WithSummary("Reports whether the process should receive traffic.");

        return endpoints;
    }

    private sealed record ReadinessResponse(string Status, string Reason);
}
