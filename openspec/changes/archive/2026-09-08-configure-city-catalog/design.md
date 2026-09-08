## Context

See `proposal.md` — Why. Constraints that shape the approach:

`DestinationCatalog` is a static list in Application; `GetDestinationAsync` looks up by name.
`GET /api/destinations/{city}` and `/destination/:city` use that name. Architecture forbids EF in
Domain and Application (`LayeredProfile`); Infrastructure may implement ports. ADR 0009 forbids EF
and product tables; this change supersedes that for the city catalog only. Postgres and
`ConnectionStrings:EscapeNow` already exist. The health check is a host-level Npgsql `SELECT 1`
and stays there — it is not an Application port. Integration tests call `/api/destinations/Lisbon`.
`/recommendations` is a sibling of `{city}` and must stay mapped as a literal path.

## Goals / Non-Goals

**Goals:**

- EF Core in Infrastructure against the existing connection string.
- Committed migrations; apply them in a way `check` and CI already have Postgres for.
- Empty-table seed of the twelve current cities with **stable UUIDs** tests can use.
- City CRUD over HTTP with no auth; Angular `/config`.
- Recommendations and detail read the store; detail and UI routes use UUID.

**Non-Goals:**

- Identity or locking `/config`.
- Saved trips, flights, itinerary.
- Moving the Open-Meteo adapter or scoring.
- Replacing the ready-probe Npgsql check with `Database.CanConnect`.
- Generating migrations at check time (they are source, like any other file).

## Decisions

**UUID in every public identifier; unique name is a column.** Domain `EuropeanCity` gains `Guid Id`.
JSON recommendations and detail include `id`. Angular `['/destination', id]`. API
`GET /api/destinations/{id:guid}`. Name is unique (citext or a unique index on `lower(name)`).
Alternative: keep name in the URL — rejected by the human. Alternative: slug — extra field with no
caller yet.

**Application port, EF only in Infrastructure.** `ICityCatalog` (name at apply) lists, gets, adds,
updates, deletes. `DestinationRecommendationService` takes that port instead of `DestinationCatalog`.
A city-management application service (or the same port used from thin endpoints) owns validation
that is not persistence (empty name, lat/long range). Alternative: `DbContext` in the host — rejected,
it would skip the port and put queries in endpoints. Alternative: EF in Application — forbidden by
architecture tests.

**`Npgsql.EntityFrameworkCore.PostgreSQL` plus EF Core, pinned in `Directory.Packages.props`.**
Exact versions are read from nuget.org at apply (current net10.0-supporting line). Infrastructure
references them. Domain and Application do not. Alternative: Dapper + SQL — rejected, the human
named EF. Alternative: keep raw Npgsql only — cannot express the catalog without a second mapper.

**Migrate and seed at host startup**, after configuration binds, before serving traffic. Seed runs
only if `Cities` has zero rows. Seed UUIDs are **constants committed next to the seed**, one per
current catalog city, so integration tests request Lisbon by that id rather than by name.
Alternative: `dotnet ef database update` as a check stage — extra tool surface. Alternative: random
UUIDs at seed — tests would have to list then pick, which is slower and order-dependent.

**City HTTP group `/api/cities`.** List/create on the collection; get/update/delete on `{id:guid}`.
Keeps `GET /api/destinations/recommendations` unambiguous. Duplicate name → 409. Unknown id → 404.
Validation failure → 400 problem details. No auth metadata. Alternative: fold CRUD into
`/api/destinations` — clashes with recommendations and with “scored view” vs “row”.

**Angular `/config`**, navbar link, Reactive or template forms sufficient for five fields. Cards
and detail switch to `id`. Wildcard still redirects to discover. Alternative: config as a modal on
discover — rejected, the spec wants a route.

**ADR 0010** records EF for this catalog and that 0009’s “no product table” no longer holds for
cities. 0009 is not rewritten.

## Risks / Trade-offs

- **Anyone can empty the catalog** → accepted for the demo; documented on the config page as
  operator tooling, not an admin product.
- **Startup migrate needs Postgres** → already true of ready and `database` check; Testing host
  uses the same connection string.
- **Old `/destination/Barcelona` bookmarks 404** → breaking, called out in the proposal.
- **EF + Npgsql ping are two clients** → same trade-off as `pg` vs Npgsql in 0009; unifying the
  ready check onto `CanConnectAsync` is a later change.
- **Seed constants vs live Unsplash URLs** → copy today’s `DestinationCatalog` values; changing
  an image later is a config-page edit.

## Migration Plan

Requires Compose (or CI service) up. Deploy applies migrations on process start. Rollback is revert
the change and drop `cities` if the table must not remain. Data already edited in a demo database
is not migrated backward.

## Open Questions

None that affect the specs or the task breakdown. EF and provider versions are pinned at apply.
