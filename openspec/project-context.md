# Project context

Team-maintained. This file is the source of the project context OpenSpec shows the agent when it
creates artifacts. `node tools/repo.mjs sync` renders it into the delimited region inside
`openspec/config.yaml`; `node tools/repo.mjs check` fails when the two drift apart.

Edit this file, not the region in `config.yaml`. Keep it short — it is loaded into planning
sessions, so every line costs context on every change.

Do not describe the product's requirements here. Requirements live in `openspec/specs/`; this file
describes the environment those requirements are implemented in.

## Stack

- .NET 10 (`net10.0`), ASP.NET Core, C# with nullable reference types enabled.
- Frontend: Angular 21 under `frontend/`, served separately from the API. Built with
  `@angular/build` (Vite) and unit-tested with Vitest; both run as stages of `check`.
- Weather: Open-Meteo, no API key.
- Persistence: PostgreSQL 18, started locally from `compose.yaml` (Rancher Desktop, dockerd).
- Tests: xUnit v3 on Microsoft.Testing.Platform. One runner, selected in `global.json`.
- Architecture rules: ArchUnitNET plus a project-reference graph check.
- Repository tooling: Node, entry point `tools/repo.mjs`.

## Conventions

- The build treats warnings as errors. An unavoidable warning is suppressed at its source with a
  justification, never repository-wide.
- Business logic belongs in Domain. Application orchestrates through the ports it declares;
  Infrastructure implements them; the host composes and registers. Endpoints stay thin.
- Test categories are separate projects, not filters: unit, architecture, integration.
- Every check is reachable through `node tools/repo.mjs check`. Nothing is validated by a command
  that exists only in CI.

## Working agreement

- A change is Standard unless a human has argued otherwise. See `CONTRIBUTING.md`.
- A red architecture test is a design question, not a rule to relax. Weakening a rule needs an ADR.
- Report what actually ran. A skipped, unavailable or failing check is reported as such, never as
  a pass.
