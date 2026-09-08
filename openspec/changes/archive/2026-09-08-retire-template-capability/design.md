## Context

See `proposal.md` — Why. The relevant current-state constraints, all verified in the tree:

- `tools/rename.manifest.json` is not purely template machinery. Alongside `placeholder`,
  `tokens`, `contentGlobs`, `renameGlobs` and `excludeGlobs` it carries a `generatedRegions` array
  that `tools/lib/generated.mjs:159` reads to keep the `BEGIN GENERATED` regions in `CLAUDE.md`
  and `openspec/config.yaml` in sync. It is also listed in `REQUIRED_FILES`
  (`tools/lib/check.mjs:47`) and exported as `MANIFEST_FILE` (`tools/lib/config.mjs:17`). Deleting
  it naively breaks `sync`, the `config` stage, and therefore `check`.
- `docs/github-setup.md` is read by the tooling, not just by humans. `tools/lib/workflows.mjs`
  hardcodes `REQUIRED_CHECKS` (lines 28–38) and `checkDocumentedNamesExist` (lines 520–540)
  asserts every required job name appears backtick-quoted in that document;
  `tools/tests/workflows.test.mjs:50` depends on it too.
- `checkClaudeMdReferences` in `tools/lib/agentconfig.mjs` fails the `agent-config` stage when a
  backtick-quoted repository path in `CLAUDE.md` does not exist on disk. Deleting a document and
  updating `CLAUDE.md` must therefore happen in the same commit.
- `src/EscapeNow.Api` is `Microsoft.NET.Sdk.Web`, so the ASP.NET Core shared framework — including
  the health-check middleware — is already available without a package reference.
  `Directory.Packages.props` currently pins only four packages.
- `IWeatherService` is registered as a typed `HttpClient`
  (`AddHttpClient<IWeatherService, OpenMeteoWeatherService>`) whose implementation calls
  `api.open-meteo.com`. `EscapeNow.Api.csproj` already declares
  `InternalsVisibleTo("EscapeNow.IntegrationTests")`.
- The `test:integration` and `test:unit` stages fail a run that executes zero tests, and
  `check.mjs` refuses an unparseable test count. Emptying a test project is a failure, not a
  saving.

## Goals / Non-Goals

**Goals:**

- Remove the template capability without leaving a stage, a spec or a document that describes
  behaviour the code no longer has.
- Keep `check` green at every commit boundary, so the change is bisectable and each group can be
  reverted alone.
- Preserve every requirement that survives the retirement, by moving it rather than deleting it.

**Non-Goals:**

- Reducing the architecture test suite beyond the module rules, or the `agentconfig.mjs` /
  `workflows.mjs` self-policing layers beyond the two sub-checks named in the proposal.
- Adding frontend CI coverage, or consolidating the duplicated toolchain setup in CI.
- Renaming the `template-configuration` capability, whose name is now a misnomer. OpenSpec treats
  a capability path as stable and archiving would create a second spec directory; this is recorded
  as a follow-up.
- Increasing product test coverage beyond what removing the Readiness slice forces. The new
  destinations integration test closes a real gap, but broadening unit coverage of
  `DestinationRecommendationService` and `OpenMeteoWeatherService` is separate work.

## Decisions

### `generatedRegions` moves into `tools/lib/generated.mjs` as a module constant

The two regions are static, tooling-internal data with exactly one consumer.

- *Alternative: a slimmed `tools/generated-regions.json`.* Rejected — it keeps a required file, a
  read and a parse on the critical path of `check` for two literal entries, and reintroduces the
  drift risk that made `rename-manifest.test.mjs` necessary in the first place.
- *Alternative: `project.config.json`.* Rejected — `findForeignKeys`
  (`tools/lib/config.mjs:104-116`) exists precisely to stop tooling concerns being declared there,
  and generated-region markers are not project identity.

`MANIFEST_FILE` and the `REQUIRED_FILES` entry are removed in the same commit, so the `config`
stage never looks for a file that is gone.

### Health uses the built-in middleware, and warm-up semantics are dropped deliberately

`builder.Services.AddHealthChecks()` plus `app.MapHealthChecks("/health/live")` and
`app.MapHealthChecks("/health/ready")`. With no checks registered both report healthy and return
200, which is what a demo with no external dependency to probe should say.

- *Alternative: two `app.MapGet(...)` calls returning `Results.Ok()`.* Marginally smaller, but it
  gives up the standard extension point, so adding a real dependency check later would mean
  rewriting the endpoints rather than registering a check.
- *Alternative: keep `ReadinessVerdict` and drop only the ports.* Rejected — the verdict's value
  was its warm-up and probe-timeout logic, which only has meaning when there are ports feeding it.

**This is an observable behaviour change and should be reviewed as one.** Today `/health/ready`
returns 503 during a configured warm-up window; afterwards it returns 200 from process start.
Nothing in EscapeNow needs the warm-up — `NoDependencyProbe` always reported an empty set, so the
verdict was always `Ready` once warm — and no spec described the old behaviour. The new
`service-health` spec states the contract that actually ships.

### The integration test stubs `IWeatherService` rather than calling Open-Meteo

`GET /api/destinations/recommendations` fans out to 12 cities. Driving it against the live API
would put a network dependency into `check`, make the stage slow and flaky, and contradict the
repository's own rule that network access needs explicit consent.

The test therefore replaces the `IWeatherService` registration in
`WebApplicationFactory.ConfigureWebHost` with an in-memory fake returning fixed snapshots, and
asserts on the observable HTTP contract: status code, the number of ranked results, descending
score order, and the 404 path for an unknown city. `OpenMeteoWeatherService` itself stays untested
here; that is a named gap, not an oversight.

This keeps `IWeatherService` load-bearing — only the three readiness ports are removed.

### Ordering: tooling first, then deletions, then prose

Each group must leave `check` green, which fixes the order:

1. `generatedRegions` into `generated.mjs`, and drop `MANIFEST_FILE` / `REQUIRED_FILES`.
2. Delete the generator: `template-tests.mjs`, `init.mjs`, the two tests, the manifest,
   `.template.config/`, `template.yml`, and the `init` command — together with the
   `REQUIRED_CHECKS` entry and the workflow/hook test fixtures that reference them. Splitting this
   leaves either a required check with no workflow or a test for deleted code.
3. Readiness to health, with the integration test rewritten in the same commit.
4. Modules, then MCP, then the hook — independent of each other.
5. Docs, `CLAUDE.md` and `SECURITY.md` last, since `checkClaudeMdReferences` ties a document's
   deletion to the map that points at it.
6. The archive entry, verified against the gate.

### The archive entry is deleted only after the gate is proven indifferent to it

`change-workflow-and-archive-gate` already distinguishes removing an *active* change directory
from removing an archived one, so no spec change is proposed. But `gate.mjs` compares directories
removed in a commit range against archive entries added in it, and that logic has not been
exercised against an `archive/` deletion. The task list verifies it on the branch first. If the
gate does object, the fix is the gate's path handling, inside this change, with the spec left
alone — not a spec amendment to legitimise a bug.

## Risks / Trade-offs

- **`/health/ready` stops returning 503 during warm-up.** → Called out above and in the new spec so
  it is reviewed rather than discovered. Nothing in EscapeNow or the frontend reads readiness.
- **Deleting `docs/` files reddens `check` if `CLAUDE.md` is not updated in the same commit.** →
  `checkClaudeMdReferences` is the guard; grouping the prose edits with their deletions is why
  docs come last.
- **`docs/github-setup.md` is coupled to CI job names in two files.** → Trimmed, not deleted. The
  `template.yml` jobs leave `REQUIRED_CHECKS`, the document and the workflow together.
- **Deleting an archive entry could trip the gate's removal-linkage check.** → Verified before the
  deletion is relied on; see the decision above.
- **Removing `checkMcp` and one forbidden-literal pattern weakens two validations.** → Both cover
  configuration surfaces that no longer exist. The permission rule against trusting all project
  MCP servers is retained, so re-enabling MCP later cannot silently bypass it. The trade-off is
  that reinstating MCP must also reinstate its validation, which the REMOVED requirement's
  migration note records.
- **A smaller test suite over a smaller codebase can look like reduced rigour.** → The counts to
  report are product-behaviour tests, which go up: the destinations endpoints gain their first
  coverage. Unit tests fall by 282 lines, all of which tested deleted code.
- **The change is broad, so a single revert is coarse.** → One OpenSpec change, one commit per
  group, in the order above.

## Migration Plan

No data, no deployment, no external consumers. Sequencing is the ordering decision above; each
step ends with `node tools/repo.mjs check` and the counts reported as they came out. Rollback is
`git revert` of the offending group's commit, which is why the order keeps every boundary green.

One-way door: after this change the repository cannot generate an application. Recreating that
capability means a new repository seeded from this one, not reverting a commit — which is what the
`template-initialization` migration note records.

## Open Questions

None that affect the specs, the approach or the task breakdown. The two questions this change
answers by verification rather than assumption — the gate's treatment of an archive deletion, and
whether any remaining tooling test depends on the deleted fixtures — are tasks, not open
questions.
