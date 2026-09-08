## Purpose

Gives the API a reachable PostgreSQL instance so later product state has somewhere to live, without
turning the city catalog or the save placeholder into stored data in this change.

## ADDED Requirements

### Requirement: The host can open a PostgreSQL connection

When `integrations.database` is `postgres`, the API host SHALL open a connection to the configured
PostgreSQL instance using the connection string supplied to it. A missing or unreachable instance
SHALL fail closed: it SHALL NOT be treated as a successful connection.

#### Scenario: A running instance accepts a connection
- **WHEN** PostgreSQL is listening at the configured connection string
- **THEN** the host opens a connection without error

#### Scenario: An unreachable instance is not a successful connection
- **WHEN** PostgreSQL is not reachable at the configured connection string
- **THEN** the attempt fails, and the failure is reported rather than ignored

### Requirement: Persistence does not store product data yet

The system SHALL NOT persist destinations, trips, searches, or user accounts. The city catalog
SHALL remain a static in-process list. Activating the existing save control SHALL NOT write a row.

#### Scenario: The catalog is not loaded from the database
- **WHEN** recommendations are requested
- **THEN** the twelve catalog cities are resolved without reading destination rows from PostgreSQL

#### Scenario: Save still does not persist
- **WHEN** a visitor activates save on the destination page
- **THEN** no trip row is written and no save API is called

### Requirement: Local PostgreSQL is started from a Compose file

The repository SHALL include a Compose file that starts PostgreSQL 18 for local use. Starting it
SHALL require a container engine that is free to use in every configuration. A per-seat-licensed
desktop product SHALL NOT be required.

#### Scenario: Compose starts PostgreSQL 18
- **WHEN** a contributor runs the documented Compose up command against a free container engine
- **THEN** PostgreSQL 18 accepts connections on the published port

#### Scenario: A paid desktop product is not required
- **WHEN** a reader follows the documented local setup
- **THEN** the steps name a container engine that is free in every configuration, and do not name
  Docker Desktop as the runtime
