---
description: What "done" means here, and how test results must be reported.
---

# Quality

## Honest reporting is not optional

- Report the exact command and its exact result. Not "tests pass" — the command, and the counts.
- A skipped stage is reported as skipped. A stage that could not run is reported as unable to run.
  Neither is a pass.
- "Not configured" is a distinct outcome from "passed". `node tools/repo.mjs check` prints them
  separately; keep them separate when summarising.
- Zero executed tests is a failure, not a success. The check enforces this; do not work around it.
- If you did not run something, say you did not run it. An untested claim is worth less than an
  admitted gap, because the gap can be closed.

## Tests

- A test asserts observable behaviour, not the shape of the implementation. A test that has to be
  rewritten whenever a private method changes is coupling, not coverage.
- Cover the edges the rule actually has: boundary values, empty collections, cancellation, a clock
  that moved backwards, a dependency that never answers. The happy path is the least interesting.
- An unknown state must never be reported as a good one. A probe that timed out is unavailable,
  not available.
- Name a test after the behaviour it pins down, so a failure reads as a sentence.
- No coverage threshold is imposed. A number does not tell you whether the risky path is covered;
  review does.

## Code

- Warnings fail the build. If a warning must be tolerated, suppress it at its source with a
  justification, so the exception is visible in review. Do not add a repository-wide suppression.
- Write a comment for the reason, not the mechanism. `// increment i` is noise; `// A negative
  uptime means the clock moved backwards, so it is not trusted` is the reason someone needs.
- Match the surrounding code's naming, structure and comment density. A file that reads as though
  a different person wrote each half is harder to review.
- Delete rather than comment out. History is in git.
- Do not add an abstraction for a second case that does not exist yet.

## Dependencies

- A new dependency must solve a problem this repository actually has, and it must be free to use in
  every configuration — no licence key, no paid tier, no per-seat entitlement for any user.
- Versions are pinned exactly, in `Directory.Packages.props` for NuGet and `package.json` plus the
  lockfile for Node. Do not introduce a floating range.
- Record the licence in `docs/attribution.md`.
