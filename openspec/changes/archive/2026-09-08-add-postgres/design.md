## Context

See `proposal.md` — Why. Constraints that shape the approach:

`integrations.database` is an enum of one value (`none`) in `project.config.schema.json`. `check`
lists twelve stages and none of them is `database`, even though `local-and-ci-checks` already has
a scenario that names a database stage. `/health/live` and `/health/ready` are both mapped with
no checks registered, so empty registration means healthy. `DestinationEndpointsTests` already
asserts ready returns 200 after startup. Architecture forbids EF and `System.Data` in Domain, and
EF in Application; the host may depend on a client. ADR 0007 forbids a tool that is paid in any
configuration — Docker Desktop is that class; Rancher Desktop (Apache-2.0) is not. There is no
Compose file and no Docker artifact in the tree. `ALLOWED_STEP_COMMANDS` does not need widening
for a GitHub Actions `services:` block: it is not a `run:` step. Required job names must stay
`checks`, `dependency-scan`, `secret-scan`, `archive-gate`.

PostgreSQL 18.6 is the current stable patch of the 18 line (2026-08-13). 19 is Beta 3.

## Goals / Non-Goals

**Goals:**

- One Compose file a contributor can start after Rancher Desktop is installed with dockerd.
- The same image tag in CI, without Rancher Desktop.
- `check` reports `database` with the same three outcomes as every other stage.
- Ready fails closed when Postgres is down; live does not.
- Npgsql in the host only. No EF, no migrations, no tables.

**Non-Goals:**

- Saved locations, identity, catalog-in-the-database.
- Kubernetes in Rancher Desktop, or any cluster.
- Docker Desktop as a documented option.
- Testcontainers (a second way to start Postgres).
- Making `tools/` speak ADO.NET.

## Decisions

**PostgreSQL 18.6, not 19.** 19 is not GA. The image tag is `postgres:18.6` in `compose.yaml` and
in the `checks` job `services:` block, one owner: the Compose file. CI copies that tag; it does
not invent a second version. Alternative: `postgres:18` (patch float) — rejected, this repository
pins. Alternative: 19 beta — rejected, not a demo runtime.

**Rancher Desktop with the dockerd (moby) container engine.** That is what makes `docker` and
`docker compose` the documented commands, matching CI's engine vocabulary. Kubernetes in Rancher
stays off. Alternative: containerd + nerdctl — works, but then the README would teach two CLIs.
Alternative: Docker Desktop — rejected by ADR 0007 (paid for organisations). Alternative: Podman
Desktop — also free; Rancher is the one the human named.

**Compose at the repository root, `compose.yaml`.** Service name `postgres`, published `5432:5432`,
`POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` all `escapenow`. That password is a published
demo credential, not a secret: it is in git on purpose, documented as such, and never used as a
production credential. The named volume mounts `/var/lib/postgresql` (not `/var/lib/postgresql/data`):
the official 18 image stores data under a major-version subdirectory and refuses to start on the
old path. Alternative: no published port, only a compose network — rejected, the API
and `check` run on the host, not in Compose.

**Connection string owner: environment, with a Development default.**
`ConnectionStrings:EscapeNow` in `appsettings.Development.json` matches compose. CI and
`WebApplicationFactory` set `ConnectionStrings__EscapeNow`. Production configuration does not
commit a password. The string is not duplicated into `project.config.json`.

**Ready probes with Npgsql in the composition root; live excludes that check.**
`AddHealthChecks()` gains a check that opens an `NpgsqlConnection` and `SELECT 1`.
`MapHealthChecks("/health/live")` uses a predicate that includes no checks (process up).
`MapHealthChecks("/health/ready")` includes the postgres check. No Application port, no
Infrastructure adapter, which is what `service-health` already requires. Alternative: Xabaril
`AspNetCore.HealthChecks.NpgSql` — extra dependency for one `OpenAsync`. Alternative: EF
`CanConnectAsync` — pulls EF in for a ping. Alternative: probe only in `check`, leave ready as
today — rejected, the health spec says an unknown dependency state is not healthy.

**Npgsql is pinned in `Directory.Packages.props` and referenced from `EscapeNow.Api` only.**
The exact version is read from nuget.org at apply time (the latest that supports `net10.0`).
Domain and Application stay free of it. Alternative: put the client in Infrastructure now —
rejected until there is a repository to house.

**The `database` stage pings before `test:integration`.** Implementation: `tools/lib/postgres-ping.mjs`
opened through `process.execPath`, using the `pg` package (MIT) pinned in the root lockfile,
`SELECT 1` against the same connection string the host uses (env, else the Development default
translated to a URI). Failure names `docker compose up -d`. `pg` is a check-time client so the
stage does not shell out to `docker compose exec` (CI has a service container, not Compose) and
does not spawn `dotnet` for a two-line probe. Alternative: TCP connect only — rejected, the spec
requires a connection. Alternative: skip the stage and let the ready test fail — the message
would not name Compose.

**`test:integration` requires Postgres once ready probes it.** The existing
`Readiness_answers_once_the_process_has_started` test becomes the proof that ready is 200 when
the instance is up. The Testing host sets the connection string; it does not disable the check.
A new test asserts live is 200 even if we cannot easily take Postgres down in-process; the
down-database ready case is covered by the `database` stage (connection refused) plus a host test
only if it can be done without flakiness. Alternative: disable the check under `Testing` —
rejected, it would make the integration test lie.

**CI: `services.postgres.image: postgres:18.6` on `checks` only.** Health options use `pg_isready`.
Job env sets the connection string to localhost:5432. `dependency-scan` and `secret-scan` do not
need a database. No new GitHub Action. Alternative: a second workflow job — rejected, `check`
must be one invocation.

**Schema enum `none` | `postgres`.** This repository sets `postgres`. Fixtures in
`tools/tests/check.test.mjs` still use `none` to prove `not-configured`.

## Risks / Trade-offs

- **Contributors without Rancher Desktop fail `check` locally** → documented in README /
  CONTRIBUTING; the stage message names `docker compose up -d`. CI does not need Rancher.
- **dockerd vs containerd in Rancher is a footgun** → README states dockerd (moby) explicitly;
  nerdctl is not documented as a second path.
- **Published demo password in git** → labelled as a demo credential in README and the ADR; never
  reused for a hosted environment. `gitleaks` must not treat it as a secret, or the allowlist is
  argued in that change.
- **Two clients (`Npgsql` and `pg`)** → accepted; each sits in the layer that already owns that
  language. Unifying on `dotnet` for the ping would couple `tools/` to a build.
- **`test:integration` now needs the engine** → the `database` stage runs first so a down engine
  fails with a Compose instruction instead of nine red HTTP tests.
- **Ready is a breaking operational change** → only this demo currently treats ready as “started”;
  called out in the proposal.

## Migration Plan

Contributors: install Rancher Desktop, set Container Engine to dockerd (moby), `docker compose up -d`,
then `node tools/repo.mjs check` as today. Rollback of the integration is a later change that sets
`integrations.database` back to `none` and restores empty health checks; this change does not ship
a dual-mode host.

## Open Questions

None that affect the specs or the task breakdown. The exact Npgsql and `pg` versions are read from
the registries at apply time and pinned then.
