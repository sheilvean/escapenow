## 1. Relocate the generated-region declarations

- [x] 1.1 Move the `generatedRegions` array from `tools/rename.manifest.json` into
  `tools/lib/generated.mjs` as a module constant, and verify `node tools/repo.mjs sync` produces
  no diff (`git status --porcelain` is empty afterwards)
- [x] 1.2 Remove the `tools/rename.manifest.json` entry from `REQUIRED_FILES`
  (`tools/lib/check.mjs`) and the `MANIFEST_FILE` export (`tools/lib/config.mjs`), and verify the
  `config` stage passes with `node tools/repo.mjs check`
- [x] 1.3 Update `tools/tests/config.test.mjs` so the generated-region cases read the new constant
  rather than the manifest, and verify `npm run test:tools` reports a non-zero passing count

## 2. Delete the template generator

- [x] 2.1 Delete `tools/template-tests.mjs`, `tools/lib/init.mjs`, `tools/tests/init.test.mjs`,
  `tools/tests/rename-manifest.test.mjs`, `tools/rename.manifest.json` and
  `.template.config/template.json`, and verify no surviving file references them
  (`grep -rn "rename.manifest\|template-tests\|lib/init\|template.config" tools/ .github/ package.json`
  returns nothing)
- [x] 2.2 Remove the `init` command from `tools/repo.mjs` and the `init` script from
  `package.json`; rename the package off `dotnet10-openspec-template` and rewrite its description,
  then verify `node tools/repo.mjs` reports the remaining commands and `node tools/repo.mjs init`
  is no longer recognised
- [x] 2.3 Delete `.github/workflows/template.yml` and its `template.yml` entry from
  `REQUIRED_CHECKS` in `tools/lib/workflows.mjs`; strip the `portability`, `self-check` and
  `template-required` job names from `docs/github-setup.md`, and verify the `workflows` stage
  passes with only `pr.yml` present
- [x] 2.4 Remove the `AppTemplate` fixtures and `template.yml` assertions from
  `tools/tests/workflows.test.mjs` and `tools/tests/hooks.test.mjs`, and verify
  `npm run test:tools` passes with a non-zero test count
- [x] 2.5 Remove the `template` block from `project.config.json` and its definitions from
  `project.config.schema.json`, and verify `node tools/repo.mjs doctor` reports the configuration
  as valid and exits 0. **Deviation:** the `rootNamespace`-versus-`solutionName` sub-check was
  kept. It is not dead — it fires whenever the two values differ and `Directory.Build.props`
  declares no explicit `<RootNamespace>`, which is a live misconfiguration guard independent of
  templating. Only its stale reference to the deleted customizing document was repointed
- [x] 2.6 Remove the reference to the deleted customizing document from the `check.mjs` error
  message and from `src/EscapeNow.Infrastructure/Readiness/NoDependencyProbe.cs` if that file is
  still present at this point, and verify `node tools/repo.mjs check` passes — verified during
  `/opsx:verify`: `check.mjs:138` now points at `docs/ARCHITECTURE.md`, `NoDependencyProbe.cs` was
  deleted with the slice, and no reference to the document survives anywhere

## 3. Replace the Readiness slice with health endpoints

- [x] 3.1 Register `AddHealthChecks()` and map `/health/live` and `/health/ready` in
  `src/EscapeNow.Api/Program.cs`, removing the `ReadinessOptions` binding, validation and the
  `IOptions<T>`-unwrapping registration, and verify both paths return 200 against a running host
- [x] 3.2 Delete `Domain/Readiness/`, `Application/Readiness/`,
  `Application/Abstractions/{IClock,IProcessStartTime,IDependencyProbe}.cs`,
  `Infrastructure/Readiness/` and `Api/Endpoints/HealthEndpoints.cs`, and verify
  `dotnet build EscapeNow.slnx` succeeds with warnings-as-errors still in force
- [x] 3.3 Delete `tests/EscapeNow.UnitTests/Readiness/`, and verify the `test:unit` stage executes
  a non-zero number of tests and passes — a zero-test run is a failure, not a pass
- [x] 3.4 Rewrite `tests/EscapeNow.IntegrationTests/HealthEndpointsTests.cs` as a destinations
  test that replaces the `IWeatherService` registration in `ConfigureWebHost` with an in-memory
  fake, and verify it asserts status, result count, descending score order and the 404 for an
  unknown city, with no outbound network call
- [x] 3.5 Add a liveness and readiness assertion to the rewritten integration test, and verify the
  `test:integration` stage executes a non-zero number of tests and passes

## 4. Remove the module system

- [x] 4.1 Delete `tests/EscapeNow.ArchitectureTests/ModuleRegistryTests.cs` and
  `Support/ModuleRules.cs`, and verify the `test:arch` stage executes a non-zero number of tests
  and passes
- [x] 4.2 Delete `tests/fixtures/Fixtures.Modules.Alpha` and `Fixtures.Modules.Beta`, remove both
  from `EscapeNow.slnx`, and verify `dotnet build EscapeNow.slnx` succeeds and the solution lists
  10 projects
- [x] 4.3 Remove the module-registry dependency from the `custom`-profile code path so the cycle
  rules still run when `architecture.profile` is `custom`, and verify by temporarily setting the
  profile to `custom` that the layer tests report as skipped while the cycle tests execute and
  pass, then restore `layered`
- [x] 4.4 Remove `architecture.modules` from `project.config.json` and its schema, the
  example-module forbidden-literal pattern from `tools/lib/agentconfig.mjs`, and the corresponding
  cases from `tools/tests/{agentconfig,boundaries,config}.test.mjs`, and verify
  `node tools/repo.mjs check` passes
- [x] 4.5 Regenerate the derived context with `node tools/repo.mjs sync` after the config change,
  and verify the `CLAUDE.md` and `openspec/config.yaml` generated regions no longer advertise a
  module registry and that the `config` stage reports no drift

## 5. Remove MCP and the advisory hook

- [x] 5.1 Delete `.mcp.json`, remove its `REQUIRED_FILES` entry and the `checkMcp` sub-check from
  `tools/lib/agentconfig.mjs`, remove `integrations.mcp` from `project.config.json` and its
  schema, and verify the `agent-config` and `config` stages pass
- [x] 5.2 Delete `.claude/hooks/protected-config-warning.mjs` and its registration in
  `.claude/settings.json`, and verify `checkDeclaredHooks` passes and the `permissions.ask` rules
  covering the protected configuration files are still present and unchanged
- [x] 5.3 Remove the MCP and hook rows from the advisory table in `SECURITY.md` and the MCP
  scanning sentence under its Secrets section, and verify `node tools/repo.mjs check` passes
- [x] 5.4 Remove the MCP cases from `tools/tests/{agentconfig,hooks}.test.mjs` and verify
  `npm run test:tools` passes with a non-zero test count

## 6. Slim the documentation

- [x] 6.1 Delete `docs/customizing-the-template.md`, `docs/mcp-example.md`,
  `docs/learning-loop.md` and `frontend/README.md`, folding the operative paragraph of the
  learning-loop document into `CONTRIBUTING.md` under "Working with the agent" and fixing the
  reference at `CONTRIBUTING.md:143`
- [x] 6.2 **Deviation, opposite direction:** `docs/sources-of-truth.md` was **kept** and trimmed,
  not deleted. Read in full it carries content the rule does not — the generated-files table, the
  OpenSpec boundary note, and the forbidden-literal exemptions the `agent-config` stage relies on
  — so deleting it would have dropped documented policy. Merging it into the rule would also have
  roughly doubled a file that loads into every session. Instead the rule was shrunk to the facts
  worth carrying per-session plus a pointer, which removes the duplication and *reduces* always-on
  context
- [x] 6.3 Update the `CLAUDE.md` "Where the answers are" table and repository map: drop the
  template row, point at the surviving documents, and add `frontend/` — then verify
  `checkClaudeMdReferences` passes, since it fails on a backtick-quoted path that does not exist
- [x] 6.4 Rewrite `docs/ARCHITECTURE.md` around the Destinations slice
  (`CityBreakScorer` to `DestinationRecommendationService` to `OpenMeteoWeatherService` to
  `DestinationEndpoints`), remove the Modules section and the `IOptions<T>` section, keep a
  trimmed profile-replacement section because the requirement still stands, and verify no
  reference to a deleted file remains
- [x] 6.5 Trim the template framing from `docs/github-setup.md`, `docs/attribution.md` (keeping the
  licence tables, which are legally load-bearing) and `docs/updating-dependencies.md`, and verify
  `node tools/repo.mjs check` passes
- [x] 6.6 Reworded the framing sentences of ADR 0001 and ADR 0006 only. **Deviation:** the
  template reasoning inside ADRs 0003, 0004, 0005 and 0007 was deliberately left as written — it
  records why the decision was made when it was made, and this repository's own rule is that an
  accepted ADR is superseded, never rewritten. A note in `docs/adr/README.md` explains the
  historical context once, for all seven
- [x] 6.7 Replace the "This is a template" vulnerability-reporting section and the
  "This template configures none of the above" sentence in `SECURITY.md`, and remove the "Future
  features (UI placeholders only)" section from `README.md`, and verify both read as product
  documents
- [x] 6.8 Collapse the eight duplicated statements — the change workflow, Standard versus Trivial,
  sources of truth, the red-architecture-test response, the layer diagram, honest reporting, the CI
  safety properties and the check-command list — to the single home named in the design, and
  verify `node tools/repo.mjs check` passes and no statement contradicts its surviving copy
- [x] 6.9 Fix the stale "nine stages" comment in `.github/workflows/pr.yml` and drop the unused
  `*.sln` and `*.pfx` rules from `.gitattributes`, and verify the `workflows` stage passes

## 7. Remove the inherited archive entry

- [x] 7.1 Verify on the branch, before deleting anything, whether `node tools/repo.mjs
  archive-gate` treats the removal of a directory under `openspec/changes/archive/` as an
  unarchived change removal — record the observed behaviour, since the design commits to fixing
  the gate rather than amending the spec if it does
- [x] 7.2 Delete `openspec/changes/archive/2026-09-08-bootstrap-dotnet10-template/`, keeping the
  `document-escapenow-product` and `capture-production-lessons` entries, and verify
  `node tools/repo.mjs archive-gate` passes
- [x] 7.3 **Not applicable — no fix needed.** Task 7.1 verified the gate does not object. The
  `active` regex in `tools/lib/gate.mjs:216` carries an explicit `(?!archive/)` lookahead, and a
  `D` status under `archive/` feeds neither `removedChanges` nor `addedArchives`. Replaying the
  gate's own classification over the real `git diff --name-status` for this change: 12 archive
  files deleted, 0 classified as removed active changes. The existing spec's distinction already
  holds in the implementation, so no spec amendment and no gate change were made
- [x] 7.4 Strip the trailing commented-out example configuration from `openspec/config.yaml`, and
  verify `node tools/repo.mjs sync` produces no diff and the `config` stage reports no drift

## 8. Whole-change verification

- [x] 8.1 Run `npm ci` and `dotnet restore` from a clean `node_modules` and verify both succeed
  with the `init` script and the manifest gone
- [x] 8.2 Run `node tools/repo.mjs doctor` and verify it reports a healthy toolchain and OpenSpec
  integration, and writes nothing (`git status --porcelain` is empty)
- [x] 8.3 Run `node tools/repo.mjs check` and report every stage with its exact command and
  outcome, confirming that `test:unit`, `test:arch`, `test:integration` and `tools` each executed
  a non-zero number of tests and that no stage is reported as passed when it was not configured
- [x] 8.4 Run `node tools/repo.mjs openspec validate --all --strict` and verify the surviving
  specifications parse with the template requirements struck
- [ ] 8.5 **NOT VERIFIED by the agent — needs a human.** `.claude/settings.json` denies shell
  HTTP clients, so the manual probe could not be run and was not worked around. What *is* verified:
  the 9 integration tests drive the real `Program` over HTTP and assert 200 on `/health/live` and
  `/health/ready`, the ranked top-five and descending score order on
  `/api/destinations/recommendations`, and 404 on an unknown city. What remains unverified is
  `OpenMeteoWeatherService` against the live API, which no test covers. To check:
  `dotnet run --project src/EscapeNow.Api/EscapeNow.Api.csproj` then open
  `http://localhost:5180/api/destinations/recommendations`
- [ ] 8.6 **NOT VERIFIED by the agent — needs a human.** Requires an `npm install` in `frontend/`
  and a browser. The Angular app has no automated coverage at all, and this change did not touch
  it beyond deleting its generated `README.md`; the API contract it consumes is unchanged. To
  check: `cd frontend && npm install && npm start`, then load `/discover` and
  `/destination/:city`
- [x] 8.7 Record the before-and-after line counts for `tools/`, `docs/`, the solution's project
  count and the workflow count, and report them as measured rather than as estimated
