## Why

The twelve cities are a compile-time list. Operators cannot add a destination, fix coordinates, or
remove a city without a code change, and “Save this trip” was never the right first product table.
Postgres is already reachable. Putting the catalog in the database, seeding the current twelve, and
exposing an unauthenticated configuration page makes the catalog data instead of a constant.

## What Changes

- **EF Core** maps a `cities` table on the existing `ConnectionStrings:EscapeNow` Postgres
  instance. Migrations live with Infrastructure. Seed inserts the current twelve catalog cities
  **only when the table is empty**, so later starts do not wipe edits.
- **Full configuration** of cities: create, read, update, delete. No authentication. Twelve is
  the seed, not a cap. An empty catalog is allowed; recommendations then return an empty list.
- **BREAKING:** Destination identity is a **UUID**. The Angular route becomes `/destination/:id`.
  The detail API becomes `GET /api/destinations/{id}`. City **name** remains a unique display
  field (case-insensitive) and is not used in routes. `/destination/Barcelona` and
  `GET /api/destinations/Lisbon` stop working.
- Discover, cards, and destination detail read the database catalog. `DestinationCatalog` as a
  static list is removed.
- A configuration page (navbar-linked) lists cities and allows add/edit/remove. `/config` is a
  first-class route (unknown paths still redirect to discover).
- **Not in this change:** identity, “Save this trip”, flights, itinerary. Save stays a
  coming-soon placeholder.

## Capabilities

### New Capabilities

- `city-catalog`: cities are stored rows with a UUID identity; unauthenticated operators can
  list, create, update and delete them; the twelve current catalog cities are the empty-table seed.

### Modified Capabilities

- `destination-recommendations`: the closed list of twelve named cities becomes the database
  catalog; detail and lookup are by UUID, not city name.
- `discovery-ui`: destination route uses UUID; a configuration route exists; cards and detail
  navigate by id.
- `persistence`: destination (city) rows are stored; the “no product data” rule is replaced for
  cities only. Trips and users remain unstored.

## Impact

- Domain: `EuropeanCity` gains an id. Application: a catalog port; scoring still in Domain.
  Infrastructure: EF Core + Npgsql provider, `DbContext`, migrations, seed. Api: compose,
  migrate-on-start (or equivalent that `check` can run), city HTTP resources, destination
  `{id}` instead of `{city}`.
- Frontend: `app.routes.ts`, navbar, destination card, destination page, new config page, HTTP
  client. Recommendation JSON gains an `id`.
- Tests: integration tests that call `/api/destinations/Lisbon` must use seeded UUIDs.
- Docs: ADR superseding 0009’s “no EF / no product table” for this catalog. Attribution for EF
  packages. `docs/ARCHITECTURE.md`.
- Depends on the Postgres integration (`add-postgres`): Compose, connection string, `database`
  check stage. Save-trip remains out of scope.
