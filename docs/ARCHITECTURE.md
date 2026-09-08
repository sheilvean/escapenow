# Architecture

EscapeNow answers one question — *where in Europe should I go for a city break in the next seven
days?* — and the code is arranged so that the answer is decided in one place and merely transported
by the rest.

The repository uses one architecture profile, `layered`. It is not a menu: an unused architecture
is a liability that still has to be maintained, and the choice between them belongs to a project
with real constraints.

## The layered profile

```
        Api  ─────────────────┐
         │                    │
         ├──▶ Infrastructure ─┤
         │         │          │
         └──▶ Application ◀───┘
                   │
                 Domain
```

| Layer | Project | May reference | Holds |
| --- | --- | --- | --- |
| Domain | `src/EscapeNow.Domain` | nothing in the solution | the rules and the vocabulary they are expressed in |
| Application | `src/EscapeNow.Application` | Domain | orchestration, and the ports it needs |
| Infrastructure | `src/EscapeNow.Infrastructure` | Domain, Application | adapters implementing those ports |
| Api | `src/EscapeNow.Api` | all three | composition, configuration, HTTP mapping |

Domain must additionally stay free of the web framework, an ORM, the hosting model, a DI container,
the configuration abstractions, `System.Net.Http` and `System.Data`. Application must stay free of
the web framework, an ORM, a DI container, and the options and configuration abstractions.

The direction and both forbidden lists are declared once, in
`tests/EscapeNow.ArchitectureTests/Support/LayeredProfile.cs`. Every rule reads them from there,
so the assembly-level checks and the project-reference checks cannot disagree about the policy.

## The one vertical slice

Every layer earns its place in a single request, `GET /api/destinations/recommendations`:

- **Domain — `Destinations/CityBreakScorer`.** The scoring rule: a 0–100 city-break score from a
  week of daily forecasts, with bonuses for ideal temperature, sun and low rain, and penalties for
  storms, heavy rain and extremes. It also builds the recommendation text and the "why go now"
  reasons. It takes a forecast and returns a verdict; it knows nothing about HTTP or Open-Meteo.
  `WeatherCodeMapper` turns an Open-Meteo weather code into the domain's own
  `WeatherConditionKind`, so the vendor's numbering does not leak inward.
- **Application — `Destinations/DestinationRecommendationService`.** Lists cities through the
  `ICityCatalog` port, fans out under a `SemaphoreSlim(3)` throttle, asks the domain rule to score
  each one, ranks them and returns the best five. It reaches the forecast provider only through the
  `IWeatherService` port it declares itself. `CityCatalogService` owns catalog validation (name,
  country, image URL, coordinate ranges) and uniqueness of display names.
- **Infrastructure — adapters.** `Weather/OpenMeteoWeatherService` is the only code that knows
  Open-Meteo exists: a typed `HttpClient` against `api.open-meteo.com`, its JSON shapes, and a
  four-attempt retry with backoff for 503 and 429. `Persistence/EfCityCatalog` maps the `cities`
  table with EF Core and the Npgsql provider; migrations and the empty-table seed live here.
- **Api — composition and HTTP mapping.** `Endpoints/DestinationEndpoints` parses the query, calls
  the recommendation service, returns its answer. It branches on nothing except "was a city found",
  which is the difference between 200 and 404. `Endpoints/CityEndpoints` maps unauthenticated
  catalog CRUD onto `ICityCatalogService`. The host registers the DbContext, applies migrations at
  startup, and seeds only when the table is empty.

Health is deliberately outside that shape. `/health/live` and `/health/ready` are mapped directly
in `Program.cs` on the framework's health-check middleware. Liveness includes no checks — the
process is up. Readiness runs `SELECT 1` against PostgreSQL through Npgsql in the composition
root, so an unreachable instance is not 200. A forecast API failure is still a request failure
rather than an unhealthy process. The check is a registration here, not a port in an inner layer.

## Three enforcement mechanisms, because one is not enough

Each catches something the others structurally cannot.

### 1. ArchUnitNET, at type level

`Types().That().ResideInAssembly(Domain).Should().NotDependOnAny(...)` over the four production
assemblies. Real compiled dependencies, but only among the assemblies handed to the loader.

Every rule goes through `RuleGuard.Check`, which asserts the analysed set is non-empty first.
ArchUnitNET 0.13.4 also rejects an empty selection by itself — a negative test documents that, so
an upgrade that removes the behaviour fails loudly. `WithoutRequiringPositiveResults()` switches
that protection off, which makes it the exact call someone would add to turn a red rule green;
another negative test proves `RuleGuard` still fails such a rule.

### 2. The compiled assembly reference list

Framework leakage, via `Assembly.GetReferencedAssemblies()`.

This does **not** go through ArchUnitNET, deliberately. A rule phrased as "no type in Domain may
depend on a type in `Microsoft.AspNetCore.*`" selects from a set that was never loaded — it would
be satisfied vacuously and report success while checking nothing. The metadata reference list is
what the compiler emitted, and a forbidden dependency cannot hide from it.

### 3. The project reference graph

Parsed from the `.csproj` files by `Support/ProjectGraph.cs`.

Assembly analysis cannot see a `ProjectReference` that no code uses: the compiler omits it from the
output. A declared-but-unused forbidden edge is still a declaration of intent, and the next commit
can start using it. This check also detects cycles across the whole repository, including test and
fixture projects.

Cycle detection is proven on fabricated in-memory graphs rather than a fixture on disk, because a
circular `ProjectReference` is an MSBuild error — the repository could not compile. Without those
tests, "no cycles found" would be indistinguishable from "the detector does not work".

## Negative fixtures

`tests/fixtures/` contains libraries that break the rules on purpose:

| Fixture | Violation |
| --- | --- |
| `Fixtures.Layers.Domain` | references `Fixtures.Layers.Infrastructure`, and the web framework |
| `Fixtures.Layers.Infrastructure` | the counterpart it depends on, so the illegal edge exists to be found |

Each rule has a test that fails if the rule does **not** report a violation on its fixture. That
closes the loop: weakening a rule to make a real failure disappear turns its negative test red.

The fixtures are never part of the production rule set — production assemblies are loaded
explicitly by name from the configuration — so a deliberate violation here can neither trigger nor
mask a real finding.

## Replacing the profile

Set `architecture.profile` to `custom` in `project.config.json`.

The layer-direction rules then report themselves **skipped** — visible as skipped in the test
report, never as passed — while the whole-repository cycle check and every negative fixture test
keep running. An acyclic dependency graph is an invariant of any architecture, not a property of
this one, and the detectors have to stay proven either way.

Then: record the decision in `docs/adr/`, and describe the new direction here. `custom` means
"the layering is not checked here", not "the layering does not matter".

## Deliberately not here

No MediatR, no CQRS, no generic repository, no event bus, no AutoMapper, no result-monad library,
no Kubernetes manifests, and no Aspire. PostgreSQL stores the city catalog through EF Core in
Infrastructure (see `docs/adr/0010-ef-city-catalog.md`); trips and users are still unstored, and
every forecast is fetched per request. Each of those can be right for a specific problem; none is
right by default. If a change needs one, argue for it in that change's design document.
