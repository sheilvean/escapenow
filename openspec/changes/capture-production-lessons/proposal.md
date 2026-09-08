## Why

The template has never been used to ship anything, so its guidance is entirely prescriptive: it
says what to do, but carries almost no record of what going wrong looks like. A production
repository built from the same way of working (.NET 10, OpenSpec, project-scoped agent context) has
since accumulated real operating knowledge, and this template's own bootstrap produced a set of
verified failure modes that were written down once, in an archived handover, and are now invisible
to anyone working in the repository.

Two of the template's stated rules are also unenforced. `docs/sources-of-truth.md` declares the
OpenSpec-CLI-owned trees off-limits to hand edits with nothing checking it, and a package version
can be pinned while no project references it — a pin that reads as a capability and is not one.

## What Changes

- A `Pitfalls` section in the `repo-check` and `repo-review` skills, in symptom/cause/fix form,
  recording only failures actually observed in this repository.
- Two guardrails added to `.claude/rules/common/quality.md`: the auto-fix form of a formatter is
  not a verification step, and a test skipped for missing infrastructure is acceptable while a
  failing one is a finding.
- A fourth hook, `block-generated-edits.mjs`, which blocks hand edits to `.claude/commands/opsx/`
  and `.claude/skills/openspec-*/` and names the remedy. It is advisory, like every other hook.
- Four mechanical skill checks in the `agent-config` stage: frontmatter `name` matches the
  directory name, `description` length is within bounds, every `references/` or `scripts/` asset
  path mentioned in a body exists, and a body-length ceiling.
- Dead-pin detection in the `config` stage: every `PackageVersion` must be referenced by at least
  one project.
- `.github/dependabot.yml` for the `nuget`, `npm` and `github-actions` ecosystems.
- Rationale comments and a few missing file types in `.gitattributes`.

No new NuGet dependency, no change to the .NET build, and no production code. The analyzer packages
and the two new architecture rules are deliberately held back to a second change, because both
touch the build under `TreatWarningsAsErrors` and their blast radius is unknown until measured.

## Capabilities

### New Capabilities

None. Every change here extends an existing capability.

### Modified Capabilities

- `agent-configuration`: the permitted hook set gains a blocking guard for CLI-owned files; skill
  validation gains four mechanical checks; the rules and skills gain a recorded-failure section.
- `local-and-ci-checks`: the `config` stage gains dead-pin detection, and dependency scanning is
  paired with automated dependency updates.

## Impact

- `.claude/hooks/block-generated-edits.mjs` (new), `.claude/settings.json`,
  `.claude/skills/repo-check/SKILL.md`, `.claude/skills/repo-review/SKILL.md`,
  `.claude/rules/common/quality.md`.
- `tools/lib/agentconfig.mjs`, `tools/lib/check.mjs`, and their tests in `tools/tests/`.
  `hooks.test.mjs` goes from three hooks to four.
- `.github/dependabot.yml` (new), `.gitattributes`, `SECURITY.md` and `docs/` where the hook set and
  the check stages are described.
- No dependency, schema, project-configuration or architecture-profile change. The check keeps its
  ten stages.

A residual limitation is unchanged and must not be reported as closed: the GitHub Actions workflows
have still never executed on a runner, so Dependabot's behaviour in this repository is unverified.
