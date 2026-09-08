# 0008. The Angular app builds with `@angular/build` and tests with Vitest, on the LTS line

Status: accepted
Date: 2026-09-08

## Context

The Angular application was created on Angular 19 with the CLI defaults of that generation: the
Webpack-derived `@angular-devkit/build-angular` builders, and a `karma`/`jasmine` test target that
launches a real Chrome to run three specs. Angular 19 has since left long-term support.

Two facts, read from the npm registry on 2026-09-08 rather than from memory, decide the target:

- `@angular/core` carries a `v21-lts` dist-tag at 21.2.22, while `latest` is 22.1.5. Angular 21 is
  the current LTS line; 22 is the active one.
- `@angular/build@21.2.23` declares `vitest: ^4.0.8` as an optional peer. Vitest's `latest` is
  5.0.0, which is outside that range.

Karma is not gone from Angular 21 — it is still an optional peer of `@angular/build`, so keeping it
would have been possible. The question this record answers is why we did not.

## Decision

The frontend targets the **Angular LTS line, currently 21**, not the newest major. It builds with
**`@angular/build`** — the esbuild/Vite toolchain — and runs unit tests with the
**`@angular/build:unit-test` builder using the Vitest runner**, pinned in the 4.x line that
Angular 21 declares support for. Karma, Jasmine and `@angular-devkit/build-angular` are removed.

Tests run in jsdom, in Node. No browser is launched, installed, or waited on.

Every version in `frontend/package.json` is pinned exactly, with no caret or tilde range, and CI
installs from `frontend/package-lock.json`.

## Consequences

The test run no longer executes in a real browser engine. For the coverage this application has —
a shell that renders a navbar and an outlet — that costs nothing, and it removes the whole class of
"the check fails because this machine has no Chrome". When a test genuinely needs a real engine,
the same builder can be pointed at one through its `browsers` option; that will be an argued
change, not a silent one.

Choosing LTS over `latest` means the frontend is deliberately one major behind. That is the same
policy the .NET side follows, and it is the reason the upgrade to 22 will be a decision rather than
a drift.

Pinning Vitest to 4.x is a constraint imported from Angular's peer range, not a preference. It
moves when Angular's does.

Tests were previously invisible: nothing ran them, and a spec asserting a property the component
had never had sat green in the repository because "green" only ever meant the .NET solution. The
runner switch is therefore paired with the `frontend:build` and `frontend:test` stages of
`node tools/repo.mjs check` — see `docs/adr/0005-one-check-entry-point.md`. A new runner nobody
executes would have solved nothing.

## Alternatives considered

**Keep Karma.** It still works and needs no migration. Rejected: it is the deprecated path, it
requires a browser on every machine that runs the check, and keeping it means doing this migration
later anyway, on someone else's schedule.

**Go to Angular 22.** It is `latest` and it is supported. Rejected: it is the active line, and this
repository's stated policy is the LTS one.

**Take Vitest 5.** It is the newest. Rejected: it is outside `@angular/build@21`'s declared peer
range, and "newest" is not a reason to run an unsupported combination.

**Hand-edit `package.json` instead of running `ng update`.** Rejected: it skips every migration
schematic. The upgrade was run as 19 → 20 → 21 because the CLI refuses a two-major jump, which is
also recorded in the change that carried it out.
