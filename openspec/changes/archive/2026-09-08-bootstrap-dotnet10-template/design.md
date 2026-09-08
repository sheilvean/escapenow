# Design: configurable .NET 10 template with OpenSpec and guardrails

## Context

The repository is empty. Everything below was verified on the target machine on **2026-09-07**;
findings that contradict the published documentation are marked. See "Sources" for the record.

Verified environment:

| Tool | Version | Note |
| --- | --- | --- |
| .NET SDK | `10.0.300` | runtime `10.0.8`; a legacy `7.0.306` SDK is also installed, so `global.json` must pin 10.x |
| Node.js | `v24.16.0` | OpenSpec requires `>= 20.19.0` |
| npm | `12.0.2` | lockfile v3 |
| git | `2.54.0.windows.1` | |
| GitHub CLI | absent | no repository can rely on `gh` |

See the proposal for motivation.

## Goals / Non-Goals

**Goals**

- One set of sources serving both start paths, with one declaration of the substitution tokens.
- Architecture rules that fail on real dependency edges and are proven by negative fixtures.
- A real OpenSpec installation, project-local and pinned, with a CLI-generated Claude Code
  integration.
- An archive gate whose input is machine-readable CLI output and which fails closed on a read error.
- Every tool free to use in every configuration.

**Non-Goals**

- No alternative architectures implemented speculatively; one profile plus a documented escape hatch.
- No database, container or deployment implementation in v1.
- No CODEOWNERS and no branch-protection configuration (owner decision; see ADR 0006).
- No attempt to write GitHub account or repository settings.
- No agent running in CI.

## Decisions

### D1. Test runner: Microsoft.Testing.Platform, framework: xUnit v3

Chosen over VSTest. In the .NET 10 SDK the runner is selected in `global.json`:

```json
{ "test": { "runner": "Microsoft.Testing.Platform" } }
```

`VSTest` remains the SDK default and can be omitted, so the choice must be explicit.

**Verified locally**: `global.json` with the block above, a `net10.0` project referencing
`xunit.v3` `4.0.0` with `UseMicrosoftTestingPlatformRunner`, then `dotnet test` — both against the
project and against a `.slnx` solution — produced `Test run summary: Passed! total: 1`.

Rationale: xUnit v3 4.0.0 is a stable release with first-class MTP support, MTP is the forward path
on .NET 10, and one runner means one flag vocabulary. To avoid depending on either runner's filter
syntax at all, test *categories are separate projects* (`UnitTests`, `ArchitectureTests`,
`IntegrationTests`) selected by path, not by `--filter`. That also keeps a category's failure
attributable to a single command in the check report.

Alternative rejected: VSTest with `Microsoft.NET.Test.Sdk`. Mature, but it is the legacy path on
.NET 10 and its coverage/filter flags differ from MTP's, inviting exactly the flag mixing the
requirements forbid.

### D2. Architecture rules: ArchUnitNET, plus an own project-reference graph check

`TngTech.ArchUnitNET` `0.13.4` with `TngTech.ArchUnitNET.xUnitV3` `0.13.4` (Apache-2.0;
`netstandard2.0`, therefore usable from `net10.0`). It carries a `CycleDetection` dependency and
offers slice rules, which covers layer direction, cycles and module boundaries without writing a
graph engine.

Rejected: `NetArchTest.Rules` `1.3.2`. Smaller dependency surface, but no built-in cycle detection
or slices, so the missing part would have to be hand-written anyway.

ArchUnitNET reads compiled assemblies, so it cannot see a `ProjectReference` that no code uses. A
second, own check therefore parses the `.csproj` files, builds the project reference graph, and
asserts both the allowed edges for the active profile and the absence of cycles. Both checks are
required; neither alone satisfies "real dependencies, not names".

### D3. OpenSpec as a project-local dev dependency

`@fission-ai/openspec` `1.12.0`, pinned exactly, with `package-lock.json`.

The published installation guide documents **global installation only**
(`npm install -g @fission-ai/openspec@latest`). **Verified contrary to the documentation**: a
project-local `devDependencies` installation works, and `init` runs non-interactively. This is what
the requirements ask for (lockfile, no `latest` on every check), so the template uses the local
installation and records the divergence here.

The CLI is invoked without a shell and without `npx`, as:

```
process.execPath  node_modules/@fission-ai/openspec/bin/openspec.js  <args...>
```

**Verified**: returns exit 0 and clean JSON on stdout. This form is immune to the Windows `.cmd`
shell-resolution problem, needs no `PATH` entry, and passes arguments as a vector.

Note for implementers: the package does not export `./package.json`, so its version must be read by
file path or from the lockfile, never with `require('@fission-ai/openspec/package.json')`.

### D4. The `verify` workflow required a machine-wide change, made with consent

OpenSpec resolves the installed workflow set from **global** configuration
(`%APPDATA%/openspec/config.json` on Windows). Read from `dist/core/profiles.js` of the pinned
version: `CORE_WORKFLOWS = [propose, explore, apply, update, sync, archive]` — `verify` is **not**
in the core set; it exists only in `ALL_WORKFLOWS` and must be added to a `custom` profile.
`openspec init --profile` accepts only `core|custom` and still takes the custom workflow *list* from
global configuration, so **there is no per-project override**.

The owner's configuration was `custom` with `[propose, explore, apply, sync, archive]`. With the
owner's explicit consent the list is now `[propose, explore, apply, update, sync, archive, verify]`
(`update` added to silence a warning `openspec update` emitted on every run). A timestamped backup
of the previous file was written to the session scratchpad before the change.

**Verified**: `init --tools claude` then produced `.claude/commands/opsx/verify.md` and
`.claude/skills/openspec-verify-change/`, i.e. `/opsx:verify` is available.

Consequence to document: this is a machine-wide setting. A contributor whose machine lacks `verify`
will not have the command. `doctor` therefore detects its absence and prints the opt-in instruction
instead of failing silently, and `docs/updating-dependencies.md` states that the template must never
change a contributor's global configuration without asking.

### D5. Generated vs team-maintained files

**Verified**: `openspec update --force` left a hand-edited `openspec/config.yaml` byte-identical
(same SHA-256 before and after) and regenerated only `.claude/commands/opsx/**` and
`.claude/skills/openspec-*/**`. The boundary is therefore:

| Owner | Paths |
| --- | --- |
| OpenSpec CLI | `.claude/commands/opsx/**`, `.claude/skills/openspec-*/**` |
| Team | `openspec/config.yaml`, `.claude/settings.json`, `.claude/agents/**`, `.claude/skills/repo-*/**`, `.claude/hooks/**`, `.claude/rules/**` |
| `repo.mjs sync` | delimited regions inside `CLAUDE.md` and `openspec/config.yaml` |
| Human only | `openspec/specs/**`, `openspec/changes/**`, `docs/adr/**` |

`openspec/config.yaml` uses the current schema: `schema`, plus optional `context`, `rules.<artifact>[]`
and `operations.<op>.guidance[]`. **Verified**: OpenSpec performs **no placeholder interpolation** in
`context`. The project context is therefore authored in `openspec/project-context.md` and injected by
`repo.mjs sync` into a region delimited by explicit `BEGIN GENERATED` / `END GENERATED` markers, with
a drift check in `check` that fails when the region does not match its source. Note that
`openspec init --language <lang>` itself writes a `context:` block, so the generated region is
appended within `context` rather than replacing it.

### D6. Archive gate input

`openspec list --json` is the source. **Verified** shape:

```json
{ "changes": [ { "name": "demo-change", "completedTasks": 0, "totalTasks": 0,
                 "lastModified": "2026-09-07T19:28:03.624Z", "status": "no-tasks" } ],
  "root": { "path": "...", "source": "nearest" } }
```

Exit 0, and `openspec/changes/archive/` is **not** reported as an active change. The gate fails
closed: a non-zero exit, unparseable output, a missing `changes` array, or an unresolvable OpenSpec
root each produce a distinct read-error exit, never "zero active changes".

The "deleting a directory is not proof of archiving" rule is checked where it is deterministic: for a
pull request, the gate diffs the change directories removed in the range against the archive entries
added in the same range, and fails on a removal without a matching addition.

### D7. One rename mechanism for two start paths

The repository is a working application named with the placeholder token `AppTemplate`.

- `tools/rename.manifest.json` is the single declaration: the token set and the exact file globs
  each token applies to.
- Path A (GitHub template): the user edits `project.config.json`; `repo.mjs init` applies the
  manifest — directory and file renames plus content substitution **only** within the declared
  globs. No repository-wide replace.
- Path B (`dotnet new`): `.template.config/template.json` declares `sourceName: "AppTemplate"` and
  mirrored symbols; the template engine performs the substitution. Because `project.config.json` is
  itself in the substituted set, the generated repository arrives already named, and `repo.mjs init`
  recognises it as initialized.
- A consistency test asserts `template.json` and the manifest declare the same tokens, so the two
  paths cannot drift.

State: `project.config.json` carries `template.initialized` and `template.appliedTokens`. `init`
refuses on an initialized repository (non-zero exit, no writes). Later configuration changes go
through `sync`, which touches only generated regions — never application code. Renaming an existing
application is documented as a manual operation, not a command.

### D8. Check stages and the fix/validate split

`check` runs: `config` → `format` → `build` → `test:unit` → `test:arch` → `test:integration` →
`specs` → `agent-config` → `tools`. Each stage records its exact argv, exit code and duration, and
the summary distinguishes `passed`, `failed` and `not configured`. `format` uses
`dotnet format <solution> --verify-no-changes` (**verified** available at `10.0.300`, exit 0 on a
clean tree) and never writes; `repo.mjs format --write` is the separate, non-check fix command.

CI calls `node tools/repo.mjs check --ci`. There is no second implementation of any stage.

### D9. Free tooling only, and the secret scanner

Every dependency is MIT or Apache-2.0 and free in every configuration: `@fission-ai/openspec` (MIT),
`ajv` (MIT), `ajv-formats` (MIT), `xunit.v3` (Apache-2.0), `TngTech.ArchUnitNET` and its xUnit v3
integration (Apache-2.0), `Microsoft.Testing.Platform` (MIT).

`ajv` is pinned at `8.20.0`, not `8.17.1`: the latter is affected by GHSA-2g4f-4pwh-qvx6 (ReDoS via
`$data`). **Verified**: `npm audit` reports 0 vulnerabilities at `8.20.0`.

**`gitleaks-action` is rejected.** Its repository declares no recognised licence and v2+ requires a
`GITLEAKS_LICENSE` key for organisations — free for one configuration, paid for another. The gitleaks
**CLI** is MIT, so CI downloads a version-pinned release binary, verifies its SHA-256 against a
checksum recorded in the repository, and fails closed on a mismatch. `trufflehog` was also rejected:
free, but AGPL-3.0.

Dependency scanning uses `dotnet list package --vulnerable --include-transitive` and `npm audit`,
both built in. GitHub's own secret scanning is not relied upon, because Advanced Security is paid for
private repositories.

Actions are pinned to commit SHAs resolved on 2026-09-07:

| Action | Tag | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/setup-dotnet` | v6.0.0 | `a98b56852c35b8e3190ac28c8c2271da59106c68` |

### D10. Hook design

Three hooks, all Node scripts under `.claude/hooks/`, addressed as
`${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.mjs`, each with an explicit `timeout` well below the
600 s default, each reading stdin JSON defensively and exiting 0 on malformed input.

1. `PostToolUse` on `Edit|Write` — file-scoped feedback only: for `.cs`,
   `dotnet format whitespace --verify-no-changes --include <file>`; for `.json`/`.mjs`, a parse or
   `node --check`. Never a solution build, never a test suite. Advisory: exit 0 with a
   `systemMessage`.
2. `Stop` — reads `openspec list --json`; if `stop_hook_active` is true it exits 0 in silence.
   Otherwise, when an active change exists, it emits one informational `systemMessage` and exits 0.
   It never uses exit 2 and never sets `decision: "stop"`, so it cannot block a session; repetition
   is limited by a per-session marker under the git-ignored `.claude/state/`.
3. `PreToolUse` on `Edit|Write` for protected configuration paths — advisory `systemMessage` only,
   with no `permissionDecision`. Documented explicitly as a reminder, not an enforcement mechanism.

No hook invokes `repo.mjs check`, so no hook can re-enter itself.

### D11. Permission boundaries

`.claude/settings.json` denies reads of `.env` files and the documented credential directories, and
denies shell network and remote-access commands (`curl`, `wget`, `ssh`, `scp`, `nc`) plus
`git push`. It allows a documented set of development commands. It sets
`enableAllProjectMcpServers: false` and does not set a bypass mode.

Two facts drive the implementation and are documented rather than assumed:

- File permissions are matched only against `Edit(...)` and `Read(...)` rules. A path rule written
  for `Write(...)` is accepted and never consulted, and warns at startup — so the template writes
  `Edit(...)`.
- `permissions.defaultMode` values `auto` and `bypassPermissions` do not take effect from project or
  local settings. The template therefore does not rely on project settings to prevent them, and
  `SECURITY.md` says so.

Deny rules beat ask, which beats allow, and a broad deny cannot carry allowlist exceptions.

### D12. Architecture profile and module registry

`architecture.profile` selects `layered` (implemented) or `custom` (escape hatch). Under `custom`
the layer-direction rules report themselves not applicable while cycle and registry rules still run.
`architecture.modules` is a registry; module rules are driven by it and by convention, so adding a
module needs no test edit. Negative fixtures live in `tests/fixtures/` as separate assemblies that
the production rule set explicitly excludes and the negative tests explicitly load.

## Decisions taken during implementation

Recorded rather than folded into the sections above, so the contract that was reviewed stays
legible and the additions are visible as additions.

### D13. A `workflows` check stage, and actionlint as WASM

**This amended the approved contract.** The `local-and-ci-checks` spec listed nine stages; adding a
tenth means the specification no longer described the implementation, so the delta spec was updated
to name it, with two scenarios of its own. Flagging it rather than leaving the two out of step is
the point — a spec that quietly stops matching the code is worse than no spec. The amendment is
called out again in the verification report for the human reviewing this change.

`SECURITY.md` and `docs/github-setup.md` make specific promises about CI: least-privilege
permissions, actions pinned by SHA, no `pull_request_target`, no secrets reachable from a fork,
stable required check names, and an aggregate that cannot go green when a required job was
skipped. A promise in a document that nothing verifies is a promise that has already drifted, so
the pipeline gained a tenth stage that checks each one.

Two layers, because they answer different questions. `actionlint` answers "is this valid?"; fifteen
policy rules answer "does this do what the repository claims?" Each policy rule has a negative case
proving it fires.

actionlint is the **WASM** build (npm `actionlint`, MIT), not the Go binary. It installs with
`npm ci`, needs no network at check time, and runs identically on every platform — which also
means the `workflows` stage does not become the one check that requires a download. The Go binary
would have needed a pinned release plus a checksum, i.e. the arrangement the secret scanner already
has, for no benefit.

Found while wiring it: **the WASM instance must not be reused across files.** Reusing one crashes
with `RuntimeError: unreachable`, content-dependently, so it looks like it works until a particular
workflow triggers it. A fresh linter per file costs milliseconds; a crashed linter reports nothing,
so the crash is caught and reported as a failure rather than as "no findings".

### D14. The aggregate job's script is jq-free and executable outside CI

The claim "a skipped required job is not a pass" lives in a shell script, and no amount of YAML
linting can evaluate one. The original version queried `toJSON(needs)` with `jq`, which made it
untestable anywhere without jq — including on the machine this was built on.

Rewritten so each job's result arrives as its own environment variable. The script is then plain
enough to extract from the shipped YAML and execute against fabricated results, which is what
`tools/tests/workflows.test.mjs` does: all-success exits 0, while `skipped`, `cancelled`, `failure`
and missing each exit non-zero, for every required job. Mutating the comparison to catch only
`failure` turns twelve of those tests red.

### D15. The secret scanner's download skips an already-present archive

For the same reason: the fail-closed branch on a checksum mismatch was unreachable in any test,
because reaching it required a download. The step now skips the download when the archive is
already there — which also makes it re-runnable — so a test can plant an archive with a known
digest and execute the real script offline. A mismatch is confirmed to delete the archive, not
extract the binary, and fail the job.

### D16. `solutionName` allows dots

The first schema restricted it to a single C# identifier, which rejected `dotnet new -n
"Zeta.Service"` — an ordinary .NET name. It is now dot-separated identifiers, so the projects
become `Zeta.Service.Domain` and so on.

### D17. An empty validation set is reported, not implied

`openspec validate --all --strict` answers "No items found to validate." with exit 0 in a freshly
generated application, which is legitimate on day one. The `specs` stage now says so explicitly,
because "passed" would otherwise imply that a requirement had been checked.

### D18. `doctor` treats an uninitialized repository as information

Being uninitialized is the template's own correct state. Reporting it as a failure made `doctor`
red in the one repository that is supposed to look like that, which is how people learn to ignore a
tool's output.

## Risks / Trade-offs

- **The machine-wide OpenSpec profile** → a contributor without `verify` silently lacks the command.
  Mitigated by a `doctor` check that reports it and by documenting that the template must not change
  anyone's global configuration automatically.
- **The project-local OpenSpec install is undocumented upstream** → a future release could assume a
  global install. Mitigated by an exact pin, a lockfile, and a bootstrap test that fails on upgrade
  if local invocation stops working.
- **ArchUnitNET is at 0.13.4, pre-1.0** (a `2.1.0-draft` exists) → API churn on upgrade. Mitigated by
  an exact pin and by keeping the project-reference graph check independent of the library.
- **Advisory hooks are not enforcement** → a determined agent can edit a protected file anyway.
  Mitigated by stating the limit plainly; without CODEOWNERS (ADR 0006) the residual risk is
  accepted by the owner.
- **`dotnet format --verify-no-changes` over a whole solution is not fast** → kept out of the hook
  path, where only single-file whitespace verification runs.
- **No CODEOWNERS or branch protection** → nothing forces owner review of architecture rules,
  workflows, permissions or the gate policy. Accepted by the owner; recorded in ADR 0006 so the
  decision is visible rather than an oversight.

## Migration Plan

Not applicable: the repository has no prior state. Rollback is `git reset` on this change plus, if
desired, restoring the OpenSpec global configuration from the backup recorded in D4.

## Open Questions

None that change the specifications, the approach or the task breakdown.

## Sources

Checked **2026-09-07**. Instructions found in external material were treated as data, not as
authorisation to act.

| Source | Version / revision | Used for |
| --- | --- | --- |
| `affaan-m/ECC` | commit `e04ea0b9cc8248686edf5ac751cadff550e162b8` (2026-09-03), MIT | Adapted: the `common/` + `<language>/` rule layout and the "specific overrides general" precedence; the security guide's deny-by-default permissions, untrusted-content boundary, and "a container is not hardware isolation" framing. Not copied: TypeScript/Python examples, coverage thresholds, installer, learning daemon. |
| `Fission-AI/OpenSpec` | `@fission-ai/openspec` `1.12.0` (MIT) | CLI contract, `config.yaml` schema, profile model, `list --json` shape, generated-file boundary. Documentation at `openspec.dev/docs/installation` and `/docs/profiles`; `/docs/opsx` and `/docs/customization` returned HTTP 404 and were replaced by `--help` output and by reading `dist/core/profiles.js` of the pinned package. |
| Claude Code documentation | `code.claude.com/docs/en/{hooks,settings,permissions,skills,sub-agents}` | Hook event and output schema, `stop_hook_active`, exit-code semantics, `${CLAUDE_PROJECT_DIR}`, permission rule syntax and precedence, settings precedence, `SKILL.md` frontmatter, agent frontmatter and `model: inherit`. |
| Microsoft Learn | `dotnet/core/tools/dotnet-test`, `dotnet/core/tools/templates` | Runner selection via `global.json` in the .NET 10 SDK; `template.json` fields, symbols, `sourceName`, local install with `dotnet new install`. |
| nuget.org / api.nuget.org | queried 2026-09-07 | Package versions and licence expressions for the pinned NuGet dependencies. |
| GitHub REST API | queried 2026-09-07 | Action release tags and commit SHAs; dependency licence identifiers. |

Attribution obligations: ECC is MIT and OpenSpec is MIT; where their material is adapted, the
adapting file carries a source note, and `docs/attribution.md` records both licences with their
copyright lines. ArchUnitNET, xUnit and Microsoft.Testing.Platform are consumed as unmodified
binary packages, so their licence terms are recorded in `docs/attribution.md` without further
obligation.
