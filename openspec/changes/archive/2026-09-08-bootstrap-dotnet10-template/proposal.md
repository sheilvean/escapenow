# Bootstrap a configurable .NET 10 repository template

## Why

Every new .NET service in this organisation re-invents the same scaffolding: SDK pinning, analyzer
policy, layering rules, a test layout, an agent context, and a change process. The scaffolding is
copied by hand, so it drifts, and the copy usually drags along the previous project's domain names,
owners and infrastructure. Reviewing an agent's work also starts too late — after the code exists —
because nothing in the repository makes the proposal a required artifact.

This change creates a GitHub/`dotnet new` template whose *way of working* is inheritable: a
validated project configuration, a single check entry point, executable architecture rules, a real
OpenSpec installation, and a small project-scoped Claude Code context. A new application inherits
the process and the guardrails without inheriting anyone's domain, accounts or secrets.

## What Changes

- **New**: `project.config.json` plus a JSON Schema that validates it. It carries solution name,
  root namespace, paths, architecture profile, module registry, documentation language, optional
  integrations, and the OpenSpec change/archive policy. It is not a dependency manager: the SDK
  stays in `global.json`, NuGet versions in `Directory.Packages.props`, OpenSpec in
  `package.json` + lockfile, product requirements in OpenSpec, and architecture rationale in ADRs.
- **New**: `tools/repo.mjs`, a portable Node entry point exposing `init`, `doctor`, `check`,
  `sync`, `format` and `openspec` passthrough. Windows/Linux/macOS, no WSL, paths with spaces,
  callable from a subdirectory, no `eval`, no shell interpolation.
- **New**: a single rename mechanism shared by both start paths. `tools/rename.manifest.json`
  declares the substitution tokens and the exact file set they apply to. `.template.config/template.json`
  mirrors the same tokens for `dotnet new`. A consistency test fails if the two drift apart.
- **New**: a minimal but running `net10.0` foundation — `Domain`, `Application`, `Infrastructure`,
  `Api` — with a health endpoint, configuration binding, consistent HTTP problem responses, and a
  test that actually starts the host.
- **New**: an architecture test project built on ArchUnitNET that checks layer direction, framework
  leakage into `Domain`, dependency cycles, module boundaries and module-registry consistency —
  over real assembly and project references, not namespace names. Negative fixture assemblies prove
  each rule detects its violation, and every rule asserts it analysed a non-empty assembly set.
- **New**: a real OpenSpec installation as a dev dependency (`@fission-ai/openspec`, pinned,
  lockfile, local CLI invocation) with the CLI-generated Claude Code integration, and an archive
  gate driven by `openspec list --json`.
- **New**: a project-scoped Claude Code context — `CLAUDE.md`, path-scoped rules, `repo-check` and
  `repo-review` skills, `code-reviewer` and `architecture-reviewer` subagents, three small hooks,
  and an `.mcp.json` with no active servers.
- **New**: GitHub workflows for pull requests and for validating the template itself, with minimal
  permissions and actions pinned by commit SHA.
- **New**: documentation — README, ARCHITECTURE, ADRs, CONTRIBUTING, SECURITY, a customisation
  guide, a sources-of-truth map, and update procedures for the SDK, OpenSpec and the agent config.
- **Excluded by explicit owner decision**: CODEOWNERS and GitHub branch-protection/ruleset
  configuration. The template therefore does not enforce owner review on its own protected files;
  this is recorded as an accepted risk in `docs/adr/0006-no-codeowners.md`.
- **Excluded from v1**: database persistence, container/deployment pipelines, and MCP server
  examples. Each remains a documented extension point reported as "not configured", never as
  "passed".

## Capabilities

### New Capabilities

- `template-configuration` — the validated project configuration and the sources-of-truth split.
- `template-initialization` — the two start paths, the shared parameter mechanism, dry-run,
  idempotent re-init, and the separation of first initialization from later reconfiguration.
- `architecture-enforcement` — executable architecture rules and their negative fixtures.
- `local-and-ci-checks` — the single `check` entry point, the fix/validate separation, and CI parity.
- `change-workflow-and-archive-gate` — Standard/Trivial change classes and the archive gate.
- `agent-configuration` — the Claude Code context, permission boundaries, hooks, and their
  validation in CI.

### Modified Capabilities

None. This is the repository's first change.

## Impact

- Affected code: the entire repository; it does not yet contain an application.
- Dependencies added: `@fission-ai/openspec` 1.12.0, `ajv` 8.20.0, `ajv-formats` 3.0.1 (Node,
  dev-only); `xunit.v3` 4.0.0, `TngTech.ArchUnitNET` 0.13.4, `TngTech.ArchUnitNET.xUnitV3` 0.13.4,
  `Microsoft.Testing.Platform` (NuGet, test-only). All are MIT or Apache-2.0 and free in every
  configuration; no dependency requires a licence key, a paid tier, or a per-seat entitlement.
- Global side effect already applied with the owner's consent: the machine-wide OpenSpec profile
  now lists `verify` (and `update`), because OpenSpec resolves the workflow set from global
  configuration and offers no per-project override. A backup of the previous file was kept.
- Not affected: any GitHub account state. The template performs no writes against GitHub.
