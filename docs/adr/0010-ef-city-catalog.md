# 0010. EF Core for the city catalog, UUID identity, unauthenticated configuration

Status: accepted
Date: 2026-09-08

Supersedes, for the city catalog only: ADR 0009's decision that there is no EF Core, no
migrations, and no product table. 0009 still owns Compose, Rancher Desktop (dockerd), the
published demo credential, and the host-level Npgsql `SELECT 1` ready probe.

## Context

The twelve European cities lived in `DestinationCatalog`, a compile-time list. Operators could
not add a destination, fix coordinates, or remove a city without a code change. PostgreSQL was
already reachable (`ConnectionStrings:EscapeNow`, Compose, the `database` check stage) but
stored nothing. ADR 0009 forbade EF and product tables so that wiring Postgres would not smuggle
in a persistence stack.

The catalog is now the first product table. Architecture forbids an ORM in Domain and
Application (`LayeredProfile`); Infrastructure may implement ports. Destination URLs used the
city name; the human required UUID identity in routes instead.

## Decision

**EF Core** maps a `cities` table through `CityCatalogDbContext` in Infrastructure, with the
`Npgsql.EntityFrameworkCore.PostgreSQL` provider, pinned in `Directory.Packages.props`. Domain
and Application do not reference EF. Application talks to the store through `ICityCatalog`.

Each city has a **UUID** assigned at creation that does not change. `GET /api/destinations/{id}`
and `/destination/:id` use that UUID. Name is a unique display field (PostgreSQL `citext`) and
is not used in routes.

Migrations are **committed source** and applied from the host at startup. Seed inserts the
twelve former catalog cities **only when the table is empty**, with stable UUIDs committed next
to the seed so tests can address Lisbon by id.

City CRUD is unauthenticated (`/api/cities`, Angular `/config`). Twelve is the seed, not a cap.
An empty catalog is allowed. Saved trips, identity, flights and itinerary remain out of scope;
the save control stays a placeholder.

The ready probe stays a host-level Npgsql `SELECT 1`. It is not replaced with
`Database.CanConnectAsync`.

## Consequences

Anyone who can open `/config` can empty the catalog. That is accepted for the demo and stated on
the page.

Startup now needs a migratable Postgres the same way ready and `check` already did. Old
`/destination/Barcelona` bookmarks 404.

EF and the Npgsql ping are two clients to the same instance — the same trade-off ADR 0009
accepted between `Npgsql` and `pg`. Unifying the ready check onto EF is a later change.

0009 is not rewritten. Its Compose, Rancher, credential and probe decisions still hold.

## Alternatives considered

**Keep city name in the URL.** Rejected by the human.

**A slug field.** Extra column with no caller yet.

**`DbContext` in the host, queries in endpoints.** Would skip the Application port and put
persistence in the HTTP layer.

**EF in Application.** Forbidden by the architecture tests.

**Dapper + SQL, or raw Npgsql only.** The human named EF. A second mapper would still be needed
for the catalog.

**`dotnet ef database update` as a check stage.** Extra tool surface; the host already starts
against the same instance `check` uses.

**Random UUIDs at seed.** Tests would have to list then pick, which is slower and
order-dependent.
