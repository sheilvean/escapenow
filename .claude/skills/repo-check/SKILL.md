---
name: repo-check
description: Run the repository's checks and interpret the result honestly. Use when asked to verify, validate, or check whether a change is ready, before requesting review, or after finishing an implementation. Also use when a check failed and its output needs interpreting.
argument-hint: "[stage-name]"
allowed-tools: Bash(node tools/repo.mjs *), Bash(dotnet build *), Bash(dotnet test *), Bash(dotnet format *), Read, Grep, Glob
---

# repo-check

Run the shared checks, read the output, and report what actually happened.

## When to use this

- Before asking for review.
- After finishing an implementation step.
- When a check failed and someone needs to know what the failure means.
- When asked whether the repository is in a good state.

## When not to use this

- To fix formatting. That is `node tools/repo.mjs format --write`, and it is deliberately not part
  of checking. Do not run it as part of this skill.
- To decide whether a change may be merged. That is the archive gate plus human review.

## Input

Optionally a stage name to focus the interpretation on: `config`, `format`, `build`, `test:unit`,
`test:arch`, `test:integration`, `specs`, `agent-config`, `workflows`, `tools`. With no argument, interpret
the whole run.

## Steps

1. Run the whole pipeline:

   ```
   node tools/repo.mjs check
   ```

   Run it from the repository root or any subdirectory — it finds the root itself. Do not
   substitute individual `dotnet` commands for it: the point is that one command means the same
   thing here and in CI.

2. Read the summary line and every stage header. Each stage reports one of three states:
   `passed`, `failed`, `not-configured`.

3. For each failed stage, read its output and identify the cause before changing anything:

   | Stage | What a failure usually means |
   | --- | --- |
   | `config` | a required file is missing, a value was duplicated from another source of truth, or a generated region drifted — run `node tools/repo.mjs sync` if it is drift |
   | `format` | the code does not match `.editorconfig`. Report it; fixing is a separate command |
   | `build` | a compile error, or a warning — warnings are errors here |
   | `test:arch` | the code and the architecture disagree. This is a design question, not a rule to relax |
   | `specs` | an OpenSpec artifact is structurally invalid, or the pinned CLI is not installed |
   | `agent-config` | the agent configuration is invalid, over-permissive, or references something missing |
   | `workflows` | actionlint objected, or a CI workflow no longer holds a safety property the documentation claims |
   | `tools` | the repository tooling's own tests fail — treat this as blocking, it enforces everything else |

4. If a stage reports `not-configured`, report it as not configured. It is not a pass, and the
   summary line keeps the two separate — keep them separate in your report too.

5. Report:
   - the exact command that ran;
   - the counts per state;
   - for each failure, the stage, the cause, and what would fix it;
   - anything you did not run, and why.

## Verification

The run is correctly interpreted when all of these hold:

- The command reported in your summary matches what was actually executed.
- Every failed stage is named, with a cause.
- No `not-configured` stage is described as passing.
- No test stage reporting zero executed tests is described as passing. (The check fails such a
  stage itself; if you see it, do not argue with it.)

## Stop conditions

Stop and hand back to the human, without changing anything, when:

- an architecture test fails — do not weaken a rule, widen an exclusion, or add
  `WithoutRequiringPositiveResults()`;
- the `agent-config` stage asks for a permission change;
- fixing a failure would require editing `.github/workflows/`, `.claude/settings.json`,
  `global.json`, `Directory.Packages.props`, or `project.config.json`;
- the same stage fails again after one attempted fix. Report both attempts rather than trying a
  third.
