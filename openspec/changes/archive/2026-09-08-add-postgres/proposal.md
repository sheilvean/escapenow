## Why

Saved locations — and any later product state — need a real database, and this repository has
none: `integrations.database` is the literal `none`, `check` has no database stage, and
`/health/ready` is a synonym for liveness because Program.cs has nothing to probe. Introducing
PostgreSQL now, as its own change and without any saved-trip schema, gives the next change
somewhere to write without mixing platform work into a product feature. The engine must be free
in every configuration, so the local runtime is Rancher Desktop, not Docker Desktop.

## What Changes

- **PostgreSQL 18.6** runs locally from a Compose file at the repository root, on the official
  `postgres:18.6` image. Contributors start it with `docker compose up -d` after installing
  **Rancher Desktop** with the **dockerd (moby)** container engine, so the `docker` / `docker compose`
  CLI works. Docker Desktop is not used and is not documented.
- **`integrations.database` becomes `postgres`.** The schema accepts `none` and `postgres`. `none`
  remains valid so a fixture can still prove the disabled path.
- **`check` gains a `database` stage**, inserted before `test:integration`. When the integration is
  `none`, the stage is `not-configured` (which is not a pass). When it is `postgres`, the stage
  opens a connection; a down engine fails and names `docker compose up -d`.
- **`/health/ready` probes Postgres.** Liveness stays “the process is up” and does not touch the
  database. A down database makes ready return a non-success status. **BREAKING** for anyone
  treating ready as “process started”.
- **CI starts the same image** as a GitHub Actions service container on the `checks` job, so
  `test:integration` and the new stage see Postgres without Rancher Desktop. Required job names
  stay unchanged.
- **No product tables, no EF Core, no saved locations, no identity.** The twelve-city catalog
  stays a static list. The save-this-trip placeholder stays a placeholder.

## Capabilities

### New Capabilities

- `persistence`: the API can open a connection to the configured PostgreSQL instance. Persistence
  in this change is reachability, not a store of destinations, trips, or users.

### Modified Capabilities

- `template-configuration`: `integrations.database` SHALL accept `postgres` as well as `none`.
- `local-and-ci-checks`: the declared stage list includes a database stage with the same three
  outcomes as every other stage; CI provides Postgres when the integration is enabled; the local
  engine is a free container runtime (Rancher Desktop), not a per-seat desktop product.
- `service-health`: readiness SHALL depend on the configured database when
  `integrations.database` is `postgres`; liveness SHALL NOT.

## Impact

- `compose.yaml` (new), `project.config.json`, `project.config.schema.json`.
- `tools/lib/check.mjs`, `tools/tests/check.test.mjs`, `tools/tests/config.test.mjs`,
  `tools/lib/generated.mjs` / `openspec/project-context.md` (sync).
- `.github/workflows/pr.yml` — `services:` on `checks` only; no new action, no new required job.
- `src/EscapeNow.Api/Program.cs`, `appsettings.Development.json`, `Directory.Packages.props`
  (Npgsql, pinned), integration tests for ready/live against the Testing host with a connection
  string.
- `README.md`, `CONTRIBUTING.md`, `docs/sources-of-truth.md`, `docs/attribution.md`, a new ADR
  for Postgres 18 + Rancher Desktop + Compose.
- Not in this change: Angular, destination endpoints, Open-Meteo, Domain, Application ports,
  Infrastructure weather adapter, EF Core, migrations, saved-trip tables.
