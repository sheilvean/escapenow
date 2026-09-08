# 0005. One check entry point, shared with CI

Status: accepted
Date: 2026-09-07

## Context

The usual arrangement is a set of local commands people remember, plus a CI workflow that runs
something similar in YAML. The two drift, and then a green local run stops meaning anything —
which is the same as having no local checks, except more expensive.

The requirement was one `check` covering configuration, formatting, build, unit, architecture and
fast integration tests, specification validation and agent-configuration validation; CI using that
same entry point rather than a second implementation; and formatting kept separate from validating.

## Decision

`node tools/repo.mjs check` runs nine ordered stages. `--ci` adds machine-readable output and the
pull-request-only checks. The CI workflow calls it and adds no stage logic of its own.

Three outcomes, never conflated: `passed`, `failed`, `not-configured`.

Applying formatting is a separate command, `node tools/repo.mjs format --write`.

## Consequences

- A local green and a CI green mean the same thing, because they are the same code.
- The report prints each stage's exact argv, so a failure can be reproduced by copying one line.
- **A stage that cannot run is `failed`, not `not-configured`.** Deleting a required test project
  or a required file cannot turn a stage green. That distinction is the whole point: "we chose not
  to" and "something is missing" are different facts.
- **Zero executed tests is a failure.** A run that executed nothing proves nothing, so the stage
  parses the summary and fails on a total of zero even when the exit code is zero.
- Validation never writes. The `format` stage verifies and reports; it cannot leave the working
  tree different from how it found it. `doctor` likewise reports and never repairs.
- CI cannot add a check without adding it here first. That is friction, and it is the friction
  that keeps the two in step.
- The pipeline is sequential, so the full run is slower than a fan-out of parallel CI jobs.
  Accepted: a readable, ordered report is worth more than the wall-clock saving on a template.

## Alternatives considered

**Local commands plus a separate CI workflow.** The status quo this decision rejects. It is
strictly worse and only feels lighter until the first divergence.

**A build-system target (MSBuild, Nuke, Cake).** Rejected: the pipeline has to validate Node
tooling, JSON, Markdown frontmatter and the OpenSpec CLI as well as .NET, and Node is already a
required dependency because of OpenSpec. Adding a second orchestrator would mean two.

**Parallel stages.** Rejected for v1. Ordering makes the failure report readable — configuration
before build, build before tests — and the sequence is what makes "the first failure is the one to
fix" true.

**`not-configured` reported as passed, for a quieter summary.** Rejected. It is the specific lie
the requirement forbids, and it is how a disabled check becomes an invisible one.
