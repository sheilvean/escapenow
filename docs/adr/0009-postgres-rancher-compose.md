# 0009. PostgreSQL 18.6 from Compose, on Rancher Desktop, without EF

Status: accepted
Date: 2026-09-08

## Context

`integrations.database` was the literal `none`. `/health/ready` was a synonym for liveness because
the host registered no checks. Saved locations — and any later product state — need somewhere to
write, and mixing a database into that product change would hide the platform decision inside a
feature.

ADR 0007 forbids a tool that is paid in any configuration. Docker Desktop is that class for
organisations. The human named Rancher Desktop as the local runtime.

PostgreSQL 18.6 is the current stable patch of the 18 line (2026-08-13). 19 is not GA.

## Decision

This repository runs **PostgreSQL 18.6** from **`compose.yaml` at the repository root**, image
`postgres:18.6`. Contributors start it with `docker compose up -d` after installing **Rancher
Desktop** with the **dockerd (moby)** container engine. Kubernetes in Rancher stays off. Docker
Desktop is not the documented runtime.

The image tag has one owner: `compose.yaml`. CI copies that tag onto a `services.postgres` block
on the `checks` job only. It does not invent a second version.

The published demo credential is user, database and password `escapenow`. It is in git on purpose,
labelled as a demo credential, and is never a production secret. Development configuration
(`appsettings.Development.json`) matches Compose. Production configuration does not commit a
password. The Testing host and CI set `CONNECTIONSTRINGS__ESCAPENOW`.

The host probes reachability with **Npgsql** in the composition root: `SELECT 1` on
`/health/ready`. `/health/live` includes no checks (`Predicate = _ => false`), so a database
outage does not make an orchestrator restart a healthy process. There is no Application port and
no Infrastructure adapter for this probe.

There is **no EF Core, no migrations, and no product table**. The twelve-city catalog stays a
static list. The save control stays a placeholder.

`check` gains a `database` stage after architecture tests and before integration tests. When the
integration is `none`, the stage is `not-configured` (not a pass). When it is `postgres`, the
stage opens a connection through the `pg` package; a refused connection fails and names
`docker compose up -d`.

## Consequences

A contributor without Rancher Desktop (dockerd) cannot get a green local `check`. CI does not
need Rancher: the service container is enough.

Ready is a breaking operational change for anyone who treated it as "the process has started".

Two clients (`Npgsql` in the host, `pg` in `tools/`) are accepted so the ping does not shell out
to `docker compose exec` (CI has no Compose) and does not spawn `dotnet` for a two-line probe.

The demo password will trip a secret scanner that cannot tell a published credential from a
hidden one. An allowlist is the legitimate response; hiding the value is not.

## Alternatives considered

**PostgreSQL 19.** Rejected: it is not GA.

**`postgres:18` (patch float).** Rejected: this repository pins.

**Docker Desktop.** Rejected by ADR 0007 — paid for organisations.

**containerd + nerdctl in Rancher.** Works, but then the README would teach two CLIs. dockerd
keeps `docker` / `docker compose`, matching CI.

**Podman Desktop.** Also free; Rancher is the runtime the human named.

**EF Core `CanConnectAsync`, or Xabaril `AspNetCore.HealthChecks.NpgSql`.** Rejected: the first
pulls EF in for a ping; the second is an extra dependency for one `OpenAsync`.

**Put the client in Infrastructure now.** Rejected until there is a repository to house.

**Probe only in `check`, leave ready as today.** Rejected: an unknown dependency state is not
healthy.

**Testcontainers.** A second way to start Postgres. Rejected.
