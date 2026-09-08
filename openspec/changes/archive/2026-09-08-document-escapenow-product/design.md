# Design: retroactive EscapeNow product contract

## Context

See `proposal.md` for why. The city-break slice already runs: Domain scoring and weather
classification, Application catalog and orchestration, an Infrastructure forecast client, thin
HTTP mapping, and an Angular UI under `frontend/`. `openspec/specs/` still only describes the
template. This design is how to write the missing contract without pretending the overlay was
specified first, and without changing product behaviour in the same change.

Verified against the current tree on **2026-09-08**.

## Goals / Non-Goals

**Goals**

- Record observable behaviour as three new capabilities, including edges that look accidental.
- Keep the scoring formula in one place (the domain rule and its unit tests), not duplicated as
  a second copy in the spec.
- Align agent context with the product so `CLAUDE.md` no longer forbids the domain that exists.
- Leave the existing layered profile and check pipeline untouched.

**Non-Goals**

- No new endpoints, cities, preferences, or UI states.
- No Angular inclusion in `node tools/repo.mjs check`, no E2E, no extra integration tests in this
  change. Gaps are listed so a later change can close them against this contract.
- No change to `capture-production-lessons`; that change stays independent.
- No ADR. Layering, Open-Meteo, and Angular are already in the code; this change does not choose
  them.

## Decisions

### D1. As-is contract, including awkward edges

The specs describe what the code does today, not what a first-pass design might have done.

Documented as requirements rather than bugs:

- Destination detail scores with unspecified preferences even when discover sent warm/sunny.
- Recommendation date defaults: both dates as given; start only → three days; neither → seven
  days from UTC today. The UI, not the API, owns “next weekend” and “in 3–4 days”.
- Catalog is a closed list of twelve cities, not a registry in `project.config.json`.
- Coming-soon actions do nothing.

Treating those as defects here would mix documentation with product change. A later Standard
change can tighten them against this baseline.

Alternative rejected: writing the contract we wish we’d had. That would make `/opsx:verify` fail
on the current tree, which is the opposite of catching up.

### D2. Three capabilities, weather folded into recommendations

`city-break-scoring` is the domain rule (score, sentence, reasons). `destination-recommendations`
is catalog, forecast port, ranking, and HTTP. `discovery-ui` is the Angular surfaces.

The forecast provider is not its own capability. Callers cannot choose a provider; they see
forecast days on the two HTTP resources. Retry and classification are requirements of
recommendations. Naming Open-Meteo belongs here, not in the spec: the client uses
`https://api.open-meteo.com/` with daily `weather_code`, min/max temperature, and precipitation
probability, no API key, four attempts on 429/503.

Alternative rejected: a fourth `weather-forecast` spec. It would split one HTTP conversation
across two files without a second implementation.

### D3. Specs state properties, not the bonus table

Scoring scenarios pin the outcomes already tested (ideal 85–100, storms below 60, clamp, preference
direction, non-empty reasons). They do not restate every +25 / −30 branch. Duplicating the table
would make the spec a second implementation; the first edit to a bonus would be a silent drift.

Exact integers stay in the domain rule. If a later change needs a frozen table, that change adds
scenarios — it does not belong in the first capture.

### D4. Agent context names the product; project context names the stack

`CLAUDE.md` currently says the repository is a template and “Do not add example domain modules.”
Apply updates that paragraph so the map matches `project.config.json` (EscapeNow, layered, the
four production projects) and points at the new specs for product behaviour.

`openspec/project-context.md` must not copy requirements. It may add two environment lines:
Angular UI under `frontend/`, weather from Open-Meteo. Then `node tools/repo.mjs sync`.

`architecture.modules` stays empty. Destinations live in the layered projects, not as a registered
module. Registering a module would imply `{solutionName}.Modules.{Name}` projects that do not
exist.

### D5. Documentation-only apply

Apply edits only:

- `CLAUDE.md` (hand-maintained body, not the generated region)
- `openspec/project-context.md` plus `sync`

No production, test, frontend, or check-pipeline edits. After archive, the three specs become
main specs. Tests that would lock recommendations and the UI remain a follow-up, because adding
them is implementation against this contract, not the contract itself.

## Risks / Trade-offs

- **As-is edges become the contract** → a later reader may think detail ignoring preferences is
  desired. Mitigation: this design calls them out; a follow-up change can MODIFY the requirement
  if a human wants them changed.
- **UI and recommendation HTTP stay untested** → the new specs can pass `/opsx:verify` while only
  scoring has unit tests. Mitigation: `tasks.md` records the gap; it is not silently “covered”.
- **Two active OpenSpec changes** → the archive gate still fails until both are archived.
  Mitigation: do not archive this change in the same turn as apply; the human decides order.
- **`CLAUDE.md` still has a generated region** → a hand edit outside the markers is correct;
  editing the generated map would fail `check`. Mitigation: change only the “what this repository
  is” paragraph and any pointer into `openspec/specs/`.

## Migration Plan

Not a runtime migration. Rollback is deleting the change directory before archive, or reverting
the two documentation files after apply. After archive, the three files under `openspec/specs/`
are the product contract; removing them without a replacement change would recreate the gap.

## Open Questions

None that change the specifications, the approach, or the task breakdown.
