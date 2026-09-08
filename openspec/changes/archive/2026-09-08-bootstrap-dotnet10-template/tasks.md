# Tasks

## 1. Configuration and tooling foundation

- [x] 1.1 Write `project.config.schema.json` (JSON Schema 2020-12, `additionalProperties: false`
      throughout) and `project.config.json` for the template itself, and verify `ajv` accepts the
      instance and rejects an unknown key, a bad `rootNamespace` and an unknown architecture profile
- [x] 1.2 Implement `tools/lib/config.mjs` (root discovery by walking up to `project.config.json`,
      load, schema-validate, report JSON pointers) and verify it resolves the root when invoked from
      a nested directory
- [x] 1.3 Implement `tools/lib/proc.mjs` (shell-free `spawnSync` argv runner, no `eval`, captures
      argv/exit/duration) and verify a value containing shell metacharacters reaches the child as a
      single argument
- [x] 1.4 Implement `tools/lib/openspec.mjs` invoking `process.execPath` with
      `node_modules/@fission-ai/openspec/bin/openspec.js`, reading the pinned version from the
      lockfile, and verify `list --json` parses and that a non-zero exit surfaces as a read error
- [x] 1.5 Write `tools/rename.manifest.json` declaring the `AppTemplate` token set and its file
      globs, and verify every glob matches at least one file

## 2. .NET foundation on net10.0

- [x] 2.1 Write `global.json` pinning SDK `10.0.300` with a deliberate `rollForward`, and the
      `test.runner: Microsoft.Testing.Platform` block; verify `dotnet --version` resolves 10.x in
      the repository root
- [x] 2.2 Write `Directory.Build.props` (nullable enable, `TreatWarningsAsErrors`, analysis level,
      deterministic build), `Directory.Packages.props` (central package management, exact versions),
      `NuGet.config` and `.editorconfig`; verify `dotnet restore` succeeds and central management is
      in effect
- [x] 2.3 Create `src/AppTemplate.Domain`, `src/AppTemplate.Application`,
      `src/AppTemplate.Infrastructure`, `src/AppTemplate.Api` with the allowed project references
      only, plus `AppTemplate.slnx`; verify `dotnet build` succeeds with warnings as errors
- [x] 2.4 Implement the minimal host: configuration binding, a health endpoint, and consistent HTTP
      problem responses, with business logic kept out of endpoints and the composition root; verify
      `dotnet run` serves the health endpoint
- [x] 2.5 Create `tests/AppTemplate.UnitTests`, `tests/AppTemplate.ArchitectureTests`,
      `tests/AppTemplate.IntegrationTests` on xUnit v3 4.0.0 with the MTP runner, and an integration
      test that really starts the host and calls the health endpoint; verify `dotnet test` reports a
      non-zero executed test count in each project

## 3. Architecture enforcement

- [x] 3.1 Implement the ArchUnitNET layer rules (Domain isolation, allowed directions, no framework
      leakage into Domain) reading the active profile from configuration, and verify they pass on the
      template's own solution
- [x] 3.2 Implement the empty-analysis-set guard in every rule and verify that pointing the loader at
      an empty assembly set fails rather than passes
- [x] 3.3 Implement the project-reference graph check (parse `.csproj`, assert allowed edges, detect
      cycles) and verify it flags a forbidden `ProjectReference` that no code uses
- [x] 3.4 Implement module boundary and registry-consistency rules driven by
      `architecture.modules` and convention, with no module name in any test file; verify adding a
      registry entry changes no test file
- [x] 3.5 Add negative fixture assemblies under `tests/fixtures/`, excluded from the production rule
      set, with one fixture per rule; verify each rule reports a violation on its fixture and that
      weakening a rule makes its negative test fail
- [x] 3.6 Verify the `custom` profile disables layer-direction rules while cycle and registry rules
      still execute

## 4. OpenSpec integration

- [x] 4.1 Author `openspec/project-context.md` as the team-maintained context source, and implement
      the delimited-region injection into `openspec/config.yaml` in `repo.mjs sync`; verify the
      region round-trips and that `openspec update --force` leaves the file byte-identical
- [x] 4.2 Implement the drift check that fails when the generated region does not match
      `openspec/project-context.md`, and verify it fails after an out-of-band edit
- [x] 4.3 Implement the archive gate in `tools/lib/gate.mjs` on `openspec list --json`, treating the
      archive directory as inactive; verify it blocks with one active change and passes with none
- [x] 4.4 Implement fail-closed handling for a non-zero exit, unparseable output, a missing `changes`
      array and an unresolvable root, each with a distinct read-error message; verify all four
- [x] 4.5 Implement the removed-change-without-archive-entry check over the pull-request commit
      range, and verify a deletion without a matching archive entry fails the gate
- [x] 4.6 Write the bootstrap test that installs from the lockfile in an isolated configuration and
      asserts the local CLI is invocable and `/opsx:verify` files are present; verify it fails when
      `verify` is absent from the resolved workflow set

## 5. Claude Code context

- [x] 5.1 Write `CLAUDE.md` with the repository map, pointers, commands, workflow, permission
      boundaries and the honest-reporting obligation, plus a `sync`-generated delimited region;
      verify every referenced path exists
- [x] 5.2 Write `.claude/rules/common/{workflow,quality,security,sources-of-truth}.md` and
      `.claude/rules/dotnet/{csharp-idioms,testing,aspnetcore}.md` with path scoping where it helps;
      verify the .NET rules declare a C#-scoped path
- [x] 5.3 Write `.claude/settings.json` with least-privilege allow/deny rules using `Edit(...)` and
      `Read(...)` (never `Write(...)` path rules), `enableAllProjectMcpServers: false`, no bypass
      mode; verify the settings load without a startup warning
- [x] 5.4 Write `.claude/skills/repo-check/SKILL.md` and `.claude/skills/repo-review/SKILL.md` with
      usage conditions, inputs, steps, verification and stopping conditions; verify frontmatter
      parses and referenced commands resolve
- [x] 5.5 Write `.claude/agents/code-reviewer.md` and `.claude/agents/architecture-reviewer.md` with
      restricted tools, no write or deploy capability, and `model: inherit`; verify no literal model
      identifier appears
- [x] 5.6 Write `.mcp.json` with no active servers and an opt-in example kept elsewhere; verify the
      file parses and declares an empty server set

## 6. Hooks

- [x] 6.1 Implement `.claude/hooks/post-change-feedback.mjs` (file-scoped checks only) and register
      it on `PostToolUse` for `Edit|Write` with an explicit short timeout; verify it never invokes a
      solution build or a test suite
- [x] 6.2 Implement `.claude/hooks/stop-openspec-reminder.mjs` honouring `stop_hook_active`, exiting
      0 always, and limiting repetition via git-ignored session state; verify it stays silent when
      `stop_hook_active` is true and reminds exactly once otherwise
- [x] 6.3 Implement `.claude/hooks/protected-config-warning.mjs` as advisory only, with no
      `permissionDecision`; verify it does not block an edit
- [x] 6.4 Write hook payload tests covering valid input, malformed JSON, empty stdin, missing fields
      and `stop_hook_active`; verify no hook throws an unhandled exception on any payload

## 7. Check pipeline

- [x] 7.1 Implement `repo.mjs check` with the nine ordered stages, per-stage argv/exit/duration
      recording, and a summary distinguishing passed, failed and not configured; verify a forced
      stage failure fails the run and is named in the summary
- [x] 7.2 Implement the `config` stage: schema validation, required generated files present,
      generated-region drift, and detection of a value duplicated from another source of truth;
      verify declaring an SDK version in `project.config.json` fails it
- [x] 7.3 Implement the `format` stage with `--verify-no-changes` and the separate
      `repo.mjs format --write`; verify a formatting violation fails the stage and leaves the file
      byte-identical
- [x] 7.4 Implement the `agent-config` stage: JSON and frontmatter parsing, referenced-path
      resolution, forbidden settings, forbidden literals in reusable instructions with the documented
      fixture exclusions, declared hooks present, and secret patterns; verify a missing hook script
      and a hardcoded model name each fail it
- [x] 7.5 Implement the `specs` stage on `openspec validate --all --strict --json` and the `tools`
      stage on `node --test tools/tests/`; verify both fail on an intentionally broken input
- [x] 7.6 Implement `check --ci` machine-readable output and verify a deleted required stage
      configuration fails rather than skips

## 8. CI workflows

- [x] 8.1 Write `.github/workflows/pr.yml` with least-privilege `permissions`, SHA-pinned actions,
      `pull_request` types including `ready_for_review`, `merge_group` support, stable required check
      names, and no `pull_request_target`; verify with `actionlint` and a dry parse
- [x] 8.2 Add the dependency scan (`dotnet list package --vulnerable --include-transitive`,
      `npm audit`) and the secret scan using a version-pinned gitleaks binary verified by recorded
      SHA-256; verify a checksum mismatch fails the job without executing the binary
- [x] 8.3 Add the archive gate job with a stable name, running for drafts and non-drafts alike, and
      an aggregate job that asserts every required job's result explicitly; verify a skipped required
      job makes the aggregate fail
- [x] 8.4 Write `.github/workflows/template.yml` running the template self-tests from section 9;
      verify it invokes only `repo.mjs` entry points
- [x] 8.5 Add a `workflows` check stage — actionlint (WASM, no network) plus assertions for the
      safety properties SECURITY.md and docs/github-setup.md claim; verify each policy rule fires
      on a workflow that breaks it and that actionlint objects to a deliberately broken workflow
- [x] 8.6 Make the aggregate job's script jq-free and executable outside CI, and verify by
      extracting it from the shipped workflow and running it: all-success exits 0, while skipped,
      cancelled, failure and missing each exit non-zero for every required job
- [x] 8.7 Make the gitleaks download step skip an already-present archive so its fail-closed
      branch is testable offline, and verify a mismatched checksum deletes the archive, does not
      extract the binary, and fails the job

## 9. Template portability proof

- [x] 9.1 Generate two applications with different names and namespaces, one in a path containing a
      space, and run restore/build/check on both; verify both complete and report real results
- [x] 9.2 Assert neither generated application contains the placeholder token or an unresolved
      placeholder, and that `.claude`, `.github` and `.config` are present in both
- [x] 9.3 Exercise both start paths (GitHub-template flow via `repo.mjs init`, and
      `dotnet new install` + `dotnet new`) and verify both produce an equivalent tree
- [x] 9.4 Verify re-running `init` produces no diff and exits non-zero, and that `init --dry-run`
      writes nothing
- [x] 9.5 Verify a configuration change updates only generated context and leaves authored files
      byte-identical
- [x] 9.6 Add a module fixture and verify the architecture tests cover it with no test file edited
- [x] 9.7 Break a dependency deliberately and verify the check fails; remove a required check or
      config and verify a green result is impossible
- [x] 9.8 Add an active change and verify the archive gate blocks finalization; archive it correctly
      and verify the gate passes; corrupt the configuration or the CLI output and verify the gate
      reports an error
- [x] 9.9 Verify the OpenSpec integration is in sync and `/opsx:verify` is available, and record any
      externally dependent behaviour as verified or not verified

## 10. Documentation

- [x] 10.1 Write `README.md` covering create → configure → restore → run → check → standard change,
      and verify every command it lists runs as written
- [x] 10.2 Write `docs/ARCHITECTURE.md` and the ADRs, including `0006-no-codeowners.md` recording the
      accepted risk of omitting CODEOWNERS and branch protection; verify each ADR states context,
      decision and consequences
- [x] 10.3 Write `CONTRIBUTING.md` (Standard vs Trivial, review order) and `SECURITY.md` (protection
      boundaries, what is not a sandbox, optional isolation); verify SECURITY.md states the residual
      risk explicitly
- [x] 10.4 Write `docs/customizing-the-template.md`, `docs/sources-of-truth.md` (authoritative vs
      generated) and `docs/attribution.md` (ECC and OpenSpec MIT notices, dependency licences);
      verify the generated-file table matches what `sync` actually writes
- [x] 10.5 Write `docs/github-setup.md` describing the manual administrative steps that remain with
      the repository owner, stating that the template performs no GitHub writes and that branch
      protection is intentionally not configured
- [x] 10.6 Write `docs/updating-dependencies.md` for the SDK, OpenSpec and the agent configuration,
      including the machine-wide `verify` profile caveat; verify the documented upgrade command set
      matches `package.json` and `global.json`
- [x] 10.7 Write `docs/learning-loop.md` describing the optional observation → pattern proposal →
      review → rule/skill procedure, and state that no background daemon is installed and that the
      agent may not weaken rules or widen permissions on its own
