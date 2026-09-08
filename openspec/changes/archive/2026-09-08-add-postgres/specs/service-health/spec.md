## MODIFIED Requirements

### Requirement: Liveness and readiness are separate endpoints

The API SHALL expose `GET /health/live` and `GET /health/ready`. Liveness SHALL report whether the
process is running and SHALL NOT depend on any external service, including the database. Readiness
SHALL report whether the process is prepared to receive traffic. When `integrations.database` is
`postgres`, readiness SHALL succeed only if the configured PostgreSQL instance is reachable. Both
SHALL respond without authentication, and a caller SHALL be able to route on the response status
code without parsing the body.

#### Scenario: A running process is live
- **WHEN** a client issues `GET /health/live` against a running host
- **THEN** the response status is 200

#### Scenario: A ready process accepts traffic
- **WHEN** a client issues `GET /health/ready` against a host that has completed startup and whose
  configured database is reachable
- **THEN** the response status is 200

#### Scenario: A down database is not ready
- **WHEN** a client issues `GET /health/ready` against a running host whose configured PostgreSQL
  instance is unreachable
- **THEN** the response status is not 200

#### Scenario: Liveness does not depend on the database
- **WHEN** a client issues `GET /health/live` against a running host whose configured PostgreSQL
  instance is unreachable
- **THEN** the response status is 200

#### Scenario: The status code carries the verdict
- **WHEN** a load balancer evaluates either endpoint
- **THEN** it can route on the HTTP status code alone, without reading the body
