---
description: Host, endpoint, configuration and error-shape conventions for the API project.
paths:
  - "src/*.Api/**"
  - "**/Program.cs"
  - "**/appsettings*.json"
---

# ASP.NET Core

## The host composes; it does not decide

`Program.cs` is the composition root. It binds configuration, maps ports to adapters, and maps
endpoints. It holds no business rule — the architecture tests check that endpoints do not reach
for an adapter, because that is the shape logic takes when it leaks out of the domain.

Register ports to adapters here and nowhere else. It is the only place that knows which
implementation is in use, which is what makes the implementation replaceable.

## Endpoints stay thin

An endpoint translates HTTP to a call and a result back to HTTP. Nothing else:

- No branching on domain state. Ask the application service and map its answer.
- The status code carries the meaning. A process that is not ready answers 503, not 200 with a
  sad body — a load balancer reads the code.
- Return a typed response record rather than an anonymous object once the shape matters to a
  client.

## Configuration

- Bind to an options class, validate it, and call `ValidateOnStart()`. A bad configuration value
  must fail the deployment, not the first request that happens to reach the affected path.
- The application layer takes options as a plain object. Unwrapping `IOptions<T>` is the host's
  job, which is what keeps the options abstractions out of the inner layers — and the architecture
  tests enforce that. EscapeNow currently binds no options, so a new one starts this pattern rather
  than following an example.
- Defaults live in `appsettings.json` and must be safe for a developer with no local setup.
  Anything environment-specific comes from the environment, never from a committed file.
- Never commit a production connection string, or any secret. The Development file may contain the
  published demo credential that matches `compose.yaml`; that value is labelled as such and is not
  a secret. Production configuration does not commit a password.

## Errors

- One shape for every failure: RFC 9457 problem details, through `AddProblemDetails()`,
  `UseExceptionHandler()` and `UseStatusCodePages()`.
- Include a trace identifier so a failure a client reports can be found in the logs.
- Never let exception detail reach the client, and do not vary the client-visible message by
  environment: a message that is safe in production is safe everywhere, and one that is not should
  not exist.

## Health

`/health/live` and `/health/ready` are mapped in `Program.cs` on the framework's health-check
middleware. Postgres is probed with `SELECT 1` through Npgsql, registered here, not behind an
Application port. A forecast API failure is a request failure rather than an unhealthy process.
See `openspec/specs/service-health/` and `docs/adr/0009-postgres-rancher-compose.md`.

- Liveness answers "is the process running" and must not depend on anything slow or remote. An
  orchestrator restarts the process when it fails, so a dependency outage must not make it fail.
- Readiness answers "should this receive traffic" and may consult dependencies. If one is ever
  added, an unknown dependency state is reported as unavailable, never as healthy.
- Add a dependency check by registering it here, not by introducing a port in an inner layer.

## Not imposed

No Kubernetes manifests, no Aspire, no container orchestration, no service mesh. This repository
ships one deployable process. Add what a real deployment needs, as an argued change.
