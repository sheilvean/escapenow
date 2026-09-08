## Purpose

Describes the liveness and readiness endpoints the API exposes to a load balancer or orchestrator,
so that the operational contract is reviewable rather than an undocumented side effect of the
composition root.

## ADDED Requirements

### Requirement: Liveness and readiness are separate endpoints

The API SHALL expose `GET /health/live` and `GET /health/ready`. Liveness SHALL report whether the
process is running and SHALL NOT depend on any external service. Readiness SHALL report whether the
process is prepared to receive traffic. Both SHALL respond without authentication, and a caller
SHALL be able to route on the response status code without parsing the body.

#### Scenario: A running process is live
- **WHEN** a client issues `GET /health/live` against a running host
- **THEN** the response status is 200

#### Scenario: A ready process accepts traffic
- **WHEN** a client issues `GET /health/ready` against a host that has completed startup
- **THEN** the response status is 200

#### Scenario: The status code carries the verdict
- **WHEN** a load balancer evaluates either endpoint
- **THEN** it can route on the HTTP status code alone, without reading the body

### Requirement: Health reporting introduces no ports into the inner layers

The health endpoints SHALL be satisfied by the host alone. No abstraction SHALL be added to the
Application layer, and no adapter SHALL be added to the Infrastructure layer, solely to report
health. An unknown dependency state SHALL NOT be reported as a healthy one.

#### Scenario: No health abstraction exists in Application
- **WHEN** the architecture tests inspect the Application assembly
- **THEN** it declares no port whose only purpose is health or readiness reporting

#### Scenario: Health is mapped by the host
- **WHEN** a reader inspects the composition root
- **THEN** both health endpoints are mapped there directly
