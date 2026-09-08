## Why

This repository was built as a reusable `dotnet new` template and later adapted into EscapeNow, a
demo application for planning last-minute European city breaks. Both identities are still present,
and the template half now dominates: roughly 18,400 lines of tooling, configuration, specs and
documentation surround roughly 735 lines of EscapeNow C#. `docs/` is 1,642 lines and none of it
describes the product; 44 of 1,927 test lines exercise product behaviour.

The template capability is also already unreachable. `project.config.json` records
`template.initialized: true`, so `node tools/repo.mjs init` refuses to run, and
`tools/rename.manifest.json` still names `AppTemplate.slnx` and `src/AppTemplate.*`, which no
longer exist. Keeping it costs real maintenance rather than hypothetical maintenance: two of the
last three commits were repairs to the generator, including a function that reverses the
EscapeNow rename inside a temporary copy so the generator could still be exercised.

Retiring the capability removes that class of work and leaves the documentation saying only things
that are true about EscapeNow.

## What Changes

- **BREAKING** The repository is no longer installable or usable as a template. The `init`
  command, the `dotnet new` descriptor, the rename manifest and the generator test suite are
  removed. Generating a new application from this repository will no longer be possible.
- **BREAKING** `.mcp.json` is removed and `integrations.mcp` leaves `project.config.json`. MCP was
  configured off and declared no servers; the file existed only because two checks demanded it.
- **BREAKING** The `template` block and `architecture.modules` leave `project.config.json`, and
  `project.config.schema.json` drops the matching definitions.
- The Readiness demonstration slice is replaced by two plain health endpoints. `ReadinessVerdict`,
  `ReadinessService`, `ReadinessOptions`, `DependencyReport`, the `IClock`, `IProcessStartTime`
  and `IDependencyProbe` ports and their adapters go; `/health/live` and `/health/ready` are
  mapped directly in `Program.cs`. Both paths keep responding, so the HTTP surface is preserved
  even though no spec previously described it.
- The integration test project is repointed from the Readiness slice to
  `/api/destinations/recommendations` and `/api/destinations/{city}`, which have no coverage today.
  This is required, not incidental: the `test:integration` stage fails a run that executes zero
  tests, so the project cannot be left empty.
- The module system is removed. `architecture.modules` has always been empty, and supporting an
  empty registry costs `ModuleRegistryTests`, `Support/ModuleRules.cs`, the
  `Fixtures.Modules.Alpha` and `Fixtures.Modules.Beta` projects, and a forbidden-literal pattern
  that can never fire.
- `.claude/hooks/protected-config-warning.mjs` is removed. It emits no `permissionDecision`, so it
  never blocks anything; the constraint it narrates is already enforced by the `permissions.ask`
  rules in `.claude/settings.json`.
- One CI workflow is removed (`.github/workflows/template.yml`), leaving `pr.yml` as the single
  pull-request workflow.
- Documentation is slimmed: `docs/customizing-the-template.md`, `docs/mcp-example.md`,
  `docs/learning-loop.md`, `frontend/README.md` and `docs/sources-of-truth.md` are deleted;
  `docs/github-setup.md`, `docs/attribution.md`, `docs/updating-dependencies.md` and
  `docs/ARCHITECTURE.md` are trimmed and re-framed around the product. Eight verified prose
  duplications across `CLAUDE.md`, `CONTRIBUTING.md` and `.claude/rules/` are collapsed to one
  authoritative home each.
- The template's own bootstrap entry is deleted from `openspec/changes/archive/`.

## Capabilities

### New Capabilities

- `service-health`: the liveness and readiness endpoints the API exposes. No spec currently
  describes them, yet this change alters how they are implemented and what they report. Pinning
  them makes the replacement of the Readiness slice reviewable rather than invisible.

### Modified Capabilities

- `agent-configuration`: the requirement that MCP be present but inactive is removed along with
  `.mcp.json`. The hook set narrows from three hooks to two, and the requirement now states that a
  hook SHALL NOT exist merely to narrate a constraint the permission rules already enforce. Three
  further requirements are re-worded because they name "the template" as the actor, and one of
  them asserts that `init` writes nothing outside the repository — a guarantee about a command
  that no longer exists.
- `architecture-enforcement`: module boundaries and registry consistency are removed as a
  requirement. The negative-fixture requirement narrows to the layer rules, the replaceable-profile
  requirement drops its dependency on the module-registry rules, and "the template" becomes "the
  repository" throughout.
- `template-configuration`: **not** retired. Its substance — a schema-validated
  `project.config.json`, one source of truth per concern, and no hardcoded application identity in
  reusable instructions — all survives. The delta drops the module registry and the template
  initialization marker from the declared configuration, repoints the sources-of-truth scenario at
  the surviving rule file, and removes the example-module-name clause whose literal pattern can no
  longer fire. The capability name is now a misnomer; renaming it is noted as a follow-up rather
  than done here, because OpenSpec treats a capability path as stable.
- `local-and-ci-checks`: gains the three requirements that survive the retirement of
  `template-initialization` — `repo.mjs` portability and shell-free invocation, `doctor`'s
  no-write guarantee, and the rule that `sync` regenerates only generated files and never
  overwrites authored specs, changes or ADRs. These move rather than disappear.
- `change-workflow-and-archive-gate`: the per-pull-request scope requirement is re-worded off
  "the template". The gate's own behaviour is unchanged — deleting an already-archived entry is
  not the same as deleting an unarchived change directory, which the existing requirement already
  distinguishes, so it is verified during implementation rather than re-specified.

### Removed Capabilities

- `template-initialization`: retired. The `dotnet new` and GitHub-template start paths, targeted
  renaming, `init --dry-run`, and the initialization-versus-reconfiguration distinction all go,
  together with the `template` block in `project.config.json`. Four of its seven requirements are
  removed outright; the other three move to `local-and-ci-checks` as described above. The
  `generatedRegions` declaration that `tools/rename.manifest.json` carried moves into
  `tools/lib/generated.mjs`, so generated-region drift detection survives.

## Impact

**Removed source**
`tools/template-tests.mjs`, `tools/lib/init.mjs`, `tools/tests/init.test.mjs`,
`tools/tests/rename-manifest.test.mjs`, `tools/rename.manifest.json`,
`.template.config/template.json`, `.github/workflows/template.yml`,
`.claude/hooks/protected-config-warning.mjs`, `.mcp.json`, the Readiness slice across all four
production projects, `tests/EscapeNow.UnitTests/Readiness/`,
`tests/EscapeNow.ArchitectureTests/ModuleRegistryTests.cs`,
`tests/EscapeNow.ArchitectureTests/Support/ModuleRules.cs`, `tests/fixtures/Fixtures.Modules.*`.

**Modified tooling**
`tools/repo.mjs` loses the `init` command. `tools/lib/generated.mjs` gains the `generatedRegions`
constant. `tools/lib/check.mjs` loses two required files and the `rootNamespace`/`solutionName`
consistency sub-check, which can no longer fire. `tools/lib/config.mjs` loses `MANIFEST_FILE`.
`tools/lib/agentconfig.mjs` loses `checkMcp` and one forbidden-literal pattern.
`tools/lib/workflows.mjs` loses the `template.yml` entry from `REQUIRED_CHECKS`.
`tools/tests/{workflows,hooks,agentconfig,config,boundaries}.test.mjs` lose the coverage of what
was removed.

**Solution shape**
`EscapeNow.slnx` drops from 12 projects to 10. CI drops from two workflows to one. `npm run init`
is removed from `package.json`, which is also renamed off `dotnet10-openspec-template`.

**Dependencies**
None added, removed or upgraded.

**Explicitly out of scope**
The architecture tests themselves beyond the module parts; the `agentconfig.mjs` and
`workflows.mjs` self-policing layers beyond the sub-checks named above; the Angular frontend's
absent CI coverage; and the duplicated toolchain setup across CI, which cannot be consolidated
into a composite action without violating the pinned-action allowlist. The `custom` architecture
profile remains supported and its requirement is kept — narrowed only where it depended on the
module-registry rules. Renaming the `template-configuration` capability to match what it now
covers is left as a follow-up.
