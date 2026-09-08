## Why

EscapeNow already answers “where should I go in Europe this week?” — catalog, scoring, Open-Meteo,
HTTP, and an Angular UI — but `openspec/specs/` still only describes the template. The product was
built without a contract, so a green check cannot tell whether the city-break behaviour is still
the intended one. The agent context still forbids example domain modules, which now contradicts
the code.

## What Changes

- **New**: three product capabilities captured from the current implementation (as-is, including
  known edges). No new user-facing behaviour.
- **New**: `CLAUDE.md` and `openspec/project-context.md` stop denying the product: the repository
  map names the city-break slice; project context may name Angular and Open-Meteo as environment,
  not as requirements.
- **Excluded**: putting the Angular app into `check`, E2E, performance tests, flights, persistence,
  itinerary generation, and saved trips. Those remain later changes.

## Capabilities

### New Capabilities

- `city-break-scoring`: the 0–100 score, recommendation copy, and “why go now?” reasons.
- `destination-recommendations`: the European city catalog, weather port, ranking, and HTTP API.
- `discovery-ui`: the Angular discover and destination-detail surfaces, including non-functional
  placeholders.

### Modified Capabilities

None. Template requirements do not change. Agent-context edits are documentation of the same
repository map the existing `agent-configuration` spec already requires.

## Impact

- Affected: `openspec/specs/` (after archive), `CLAUDE.md`, `openspec/project-context.md` (then
  `sync` into `openspec/config.yaml`). Production code is the source of the contract, not the
  target of this change.
- Tests: scoring already has unit coverage; recommendations and UI currently do not. This change
  does not add those tests — it records the behaviour they would protect.
- Dependencies, APIs, architecture profile, check stages: unchanged.
