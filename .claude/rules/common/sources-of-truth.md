---
description: Which file owns which value, so a fact is changed in one place rather than copied into several.
---

# Sources of truth

One value, one owner. When a fact appears in two files, they drift, and the one that is wrong is
usually the one someone read.

| Concern | Owner | Not here |
| --- | --- | --- |
| .NET SDK version and the test runner | `global.json` | not in `project.config.json`, not in CI YAML |
| Target framework and the warning policy | `Directory.Build.props` | not per project |
| NuGet package versions | `Directory.Packages.props` | never a `Version=` on a `PackageReference` |
| Node tooling versions, including the OpenSpec CLI | `package.json` + `package-lock.json` | not installed globally, never `latest` |
| Project identity, layout, profile, module registry, policy | `project.config.json` | not repeated in rules, skills or scripts |
| What the system must do | `openspec/specs/` | not in a code comment, not in a README |
| Work in flight | `openspec/changes/` | not in a branch name or a pull request description |
| Why a durable architectural decision was made | `docs/adr/` | not in a commit message |
| How work is done | `.claude/rules/` and `.claude/skills/` | not duplicated into `CLAUDE.md` |
| The current implementation | the code | not a document describing what the code will do |

## Reading configuration

Reusable instructions — this file, the other rules, the skills, and everything in `tools/` — read
`project.config.json` or point at it. They do not restate a project's name, paths or module list.
The check enforces this: a hardcoded application identity in a reusable instruction is a failure.

Test fixtures under `tests/fixtures/` and the tooling tests under `tools/tests/` are exempt, and
that exemption is documented in `docs/sources-of-truth.md`. Fixtures need concrete names to be
fixtures.

## Generated versus authored

`node tools/repo.mjs sync` owns the delimited regions marked `BEGIN GENERATED` in `CLAUDE.md` and
`openspec/config.yaml`. Edit the source — `project.config.json` or `openspec/project-context.md` —
and re-run `sync`. The check fails when a region no longer matches its source.

The OpenSpec CLI owns `.claude/commands/opsx/` and `.claude/skills/openspec-*/`. Do not hand-edit
them; `openspec update` will overwrite them. Everything else under `.claude/` is maintained by the
team, and `openspec update` leaves it alone.

Nothing generates `openspec/specs/`, `openspec/changes/` or `docs/adr/`. Those are written by
people and never overwritten by tooling.
