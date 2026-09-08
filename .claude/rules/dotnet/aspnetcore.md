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
  tests enforce that.
- Defaults live in `appsettings.json` and must be safe for a developer with no local setup.
  Anything environment-specific comes from the environment, never from a committed file.
- Never commit a connection string with credentials, or any secret. Local overrides go in an
  ignored file.

## Errors

- One shape for every failure: RFC 9457 problem details, through `AddProblemDetails()`,
  `UseExceptionHandler()` and `UseStatusCodePages()`.
- Include a trace identifier so a failure a client reports can be found in the logs.
- Never let exception detail reach the client, and do not vary the client-visible message by
  environment: a message that is safe in production is safe everywhere, and one that is not should
  not exist.

## Health

- Liveness answers "is the process running" and must not depend on anything slow or remote. An
  orchestrator restarts the process when it fails, so a dependency outage must not make it fail.
- Readiness answers "should this receive traffic" and may consult dependencies. An unknown
  dependency state is reported as unavailable, never as healthy.

## Not imposed

No Kubernetes manifests, no Aspire, no container orchestration, no service mesh. The template
ships one deployable process. Add what a real deployment needs, as an argued change.
