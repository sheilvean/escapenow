## 1. EF Core and the city store

- [x] 1.1 Pin the current EF Core and `Npgsql.EntityFrameworkCore.PostgreSQL` packages that support
  `net10.0` in `Directory.Packages.props`, reference them from `EscapeNow.Infrastructure` only, and
  record licences in `docs/attribution.md`; verify `dotnet restore` succeeds and Domain /
  Application have no EF package reference.
- [x] 1.2 Add `Guid Id` to `EuropeanCity`, an Application catalog port, and an Infrastructure
  `DbContext` mapped to a `cities` table with a unique case-insensitive name; verify a unit or
  architecture test still forbids EF in Domain and Application.
- [x] 1.3 Add a committed EF migration for `cities` and apply it from the host at startup; verify
  with compose up that the table exists after the API has started.
- [x] 1.4 Seed the twelve current catalog cities only when the table is empty, using committed
  stable UUIDs; verify a second start does not duplicate rows and that Lisbon’s seeded UUID can be
  read back.

## 2. HTTP and recommendations

- [x] 2.1 Expose unauthenticated `GET/POST /api/cities` and `GET/PUT/DELETE /api/cities/{id}` with
  problem details on validation failure and 409 on duplicate name; verify integration tests cover
  list after seed, create, duplicate name, get/update/delete by UUID, and missing UUID as 404.
- [x] 2.2 Point `DestinationRecommendationService` at the catalog port, include `id` on
  recommendation and detail payloads, and map `GET /api/destinations/{id:guid}`; verify
  recommendations return 200 with ids, detail by Lisbon’s seed UUID returns 200, and
  `/api/destinations/Lisbon` is not treated as a catalog city.
- [x] 2.3 Keep save as a placeholder; verify destination-page tests or inspection still show no
  save API and that architecture tests still pass.

## 3. Configuration UI and destination routes

- [x] 3.1 Change the Angular destination route to `/destination/:id`, put `id` on recommendation
  cards, and load detail by UUID; verify a browser pass: search, open a result, URL contains a
  UUID, detail renders.
- [x] 3.2 Add `/config` with navbar access, list/add/edit/delete against `/api/cities`, and keep
  unknown paths redirecting to discover; verify a browser pass: add a city, see it listed, delete
  it, and confirm `/config` does not ask for a login.
- [x] 3.3 Update frontend unit tests that assume name-based routes; verify `frontend:test` as part
  of `check` executes a non-zero number of tests and passes.

## 4. Docs and the whole check

- [x] 4.1 Write ADR 0010 for EF Core on this catalog (UUID identity, unauthenticated config,
  empty-table seed) and list it in `docs/adr/README.md`; verify 0009 is not rewritten.
- [x] 4.2 Update `docs/ARCHITECTURE.md`, `README.md` (config page, UUID destinations), and
  `docs/sources-of-truth.md` if a new owner appears; verify Docker Desktop is still not named as
  the runtime.
- [x] 4.3 With compose up, run `node tools/repo.mjs check` and record per-stage outcomes: every
  configured stage passes, including `database`, architecture, integration, and frontend stages.
- [x] 4.4 Run `/opsx:verify` and stop for human code review.
