## MODIFIED Requirements

### Requirement: One check entry point with declared stages

`node tools/repo.mjs check` SHALL run, in order: configuration and generated-file validation,
formatting verification, build with analyzers, unit tests, architecture tests, the database
integration check, fast integration tests, the browser application's production build, the
browser application's unit tests, OpenSpec artifact validation, agent-configuration validation,
continuous-integration workflow validation, and the repository tooling tests. Each stage SHALL
report its command, its outcome and its duration.

#### Scenario: Workflow validation is part of the run
- **WHEN** `check` runs in a repository containing `.github/workflows/`
- **THEN** the workflows are linted and the safety properties the documentation states about them
  are verified, as a stage of the same run

#### Scenario: A repository with no workflows reports the stage as not configured
- **WHEN** `.github/workflows/` does not exist
- **THEN** the workflow stage is reported as "not configured", and SHALL NOT be reported as passed

#### Scenario: The browser application is part of the run
- **WHEN** `check` runs in a repository whose configuration declares a frontend path
- **THEN** that application is built and its tests are executed as stages of the same run, and
  their outcomes appear in the same summary as the .NET stages

#### Scenario: The database integration is part of the run
- **WHEN** `check` runs in a repository whose configuration sets `integrations.database` to
  `postgres`
- **THEN** the database stage runs before the integration tests, and its outcome appears in the
  same summary as the other stages

#### Scenario: A failing stage fails the run
- **WHEN** any stage exits with a non-zero code
- **THEN** `check` exits with a non-zero code and the summary marks that stage as failed

#### Scenario: The report names the exact command
- **WHEN** `check` completes
- **THEN** the summary lists, for every stage, the exact command line that was executed

### Requirement: No paid or credentialed dependency in build, test or check

Building, testing and checking the repository SHALL NOT require a model API key, a Claude account,
or any paid or per-seat-licensed service. Every tool the checks invoke SHALL be free to use in every
configuration. CI SHALL NOT run an AI agent by default.

#### Scenario: Checks run without any credential
- **WHEN** `check` runs in an environment with no API keys and no logged-in accounts
- **THEN** every configured stage executes and the run completes

#### Scenario: A licence-gated tool is rejected
- **WHEN** a dependency or CI action requires a licence key or a paid tier in any configuration
- **THEN** it SHALL NOT be used, and the documentation SHALL record the free alternative chosen

#### Scenario: Local Postgres does not require a paid desktop product
- **WHEN** a contributor starts the database named by the Compose file
- **THEN** the documented runtime is free in every configuration, and Docker Desktop is not the
  required engine

## ADDED Requirements

### Requirement: The database stage fails closed when Postgres is declared but unreachable

When `integrations.database` is `postgres`, the database stage SHALL open a connection to the
configured instance. It SHALL fail when the instance is unreachable, naming the Compose command
that starts it. It SHALL NOT be reported as passed on the strength of the Compose file existing.
When `integrations.database` is `none`, the stage SHALL be reported as not configured.

#### Scenario: An unreachable Postgres fails the stage
- **WHEN** `integrations.database` is `postgres`, the instance is not accepting connections, and
  `check` runs
- **THEN** the database stage is reported as failed and the message names the Compose up command

#### Scenario: A reachable Postgres passes the stage
- **WHEN** `integrations.database` is `postgres`, the instance accepts a connection, and `check`
  runs
- **THEN** the database stage is reported as passed

### Requirement: CI provides Postgres when the integration is enabled

When `integrations.database` is `postgres`, the pull-request checks job SHALL start a PostgreSQL 18
service using the same image tag the Compose file names, before invoking `check --ci`. Required
job names SHALL be unchanged.

#### Scenario: The checks job has Postgres
- **WHEN** the pull-request checks job runs
- **THEN** a PostgreSQL 18 service is available to `check --ci` on the job's connection string

#### Scenario: Required check names stay stable
- **WHEN** a reader compares the workflow's job names to the documented required checks
- **THEN** the job list and the aggregate `required` job are unchanged
