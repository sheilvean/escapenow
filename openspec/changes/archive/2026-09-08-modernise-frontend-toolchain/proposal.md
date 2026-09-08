## Why

The browser half of EscapeNow runs on Angular 19 with the CLI's original Webpack-era build and a
Karma/Jasmine test target, and nothing in the repository verifies any of it. Both problems have to
be solved together, because each one makes the other pointless:

- Angular 19 left long-term support when Angular 21 became the current LTS line. Karma is not the
  runner Angular ships tests on any more; the supported path is the Vite-based `@angular/build`
  toolchain with Vitest, which is also what removes the "start a real browser and hope it exits"
  step from every test run.
- Upgrading a frontend that no gate executes is a change nobody can check.
  `node tools/repo.mjs check` stops at the .NET solution and `.github/workflows/pr.yml` never
  installs `frontend/`, so a broken frontend is already committed and merged today:
  `frontend/src/app/app.component.spec.ts` asserts an `app.title` property and a `Hello, frontend`
  heading that the real `AppComponent` has never had.

So this change moves the frontend onto the supported toolchain and, in the same step, puts it
behind the same gate as everything else — because the gate is the only thing that can tell whether
the migration worked.

## What Changes

- **Angular 19 → 21 (LTS).** Framework packages to 21.2.22, CLI and build tooling to 21.2.23,
  TypeScript to 5.9.3 (Angular 21 requires `>=5.9 <6.0`), zone.js to 0.16.3, rxjs to 7.8.2. The
  upgrade runs through `ng update` one major at a time (19 → 20 → 21), so each version's
  migrations apply.
- **Webpack builder → Vite.** The `build` and `serve` targets move from
  `@angular-devkit/build-angular` to `@angular/build`, which is the esbuild/Vite toolchain.
  `@angular-devkit/build-angular` is removed.
- **BREAKING for the test setup: Karma and Jasmine are removed and replaced by Vitest.** The
  `test` target becomes `@angular/build:unit-test` with the Vitest runner (`vitest` 4.1.11, the
  version Angular 21 declares as its optional peer; Vitest 5 is outside that range). `karma`,
  `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter`,
  `jasmine-core` and `@types/jasmine` all go, and `tsconfig.spec.json` stops declaring the
  `jasmine` types. Tests then run without launching or waiting on a real browser.
- **The stale spec is rewritten**, in Vitest form, against the shell that actually exists — it
  renders the navbar and a router outlet. This is not optional housekeeping: it is the file that
  proves the gap, and the new test stage cannot be introduced green while it is there.
- **`@angular/platform-browser-dynamic` is dropped.** `main.ts` bootstraps with
  `bootstrapApplication`; the package is an unused dependency.
- **The frontend joins the check pipeline.** `node tools/repo.mjs check` gains `frontend:build`
  and `frontend:test` stages, reported with the same three outcomes and the same rules as every
  other stage — "not configured" is not a pass, and zero executed tests is a failure. The
  frontend's directory is declared in `project.config.json` as `paths.frontend` rather than
  hardcoded in `tools/`.
- **CI runs what the check now requires.** The `checks` job installs the frontend from
  `frontend/package-lock.json`, and the `dependency-scan` job audits the frontend's dependency
  tree too — this change adds a whole new tree to the repository, and the current audit only ever
  looked at the root one.
- **Node is pinned to the 24 LTS line** in `package.json`'s `engines`, which is what
  `setup-node` reads. Angular 21 requires `^20.19.0 || ^22.12.0 || >=24.0.0`; the repository picks
  the current LTS rather than the oldest version that happens to work.
- **The decision is recorded**: an ADR for the builder and test-runner switch, and licence entries
  in `docs/attribution.md` for the packages this adds.

Deliberately out of scope, each already identified as its own change: the local/UTC date defect in
`destination.service.ts`; carrying search dates and preferences into the destination page;
validating Open-Meteo responses instead of defaulting missing values to zero; the provider fan-out
budget; publishing frontend and API as one artifact; and the two CI gates that do not check what
they claim (the NuGet vulnerability grep and `gitleaks dir`). Zoneless change detection is also
excluded: Angular 21 defaults new applications to it, but switching is a runtime behaviour change
and belongs in its own argued change.

## Capabilities

### New Capabilities

None. The frontend was always in scope for quality; it was simply never covered.

### Modified Capabilities

- `local-and-ci-checks`: the check pipeline's declared stages stop at the .NET solution. The
  requirement changes so the browser application is built and tested by the same entry point,
  under the same reporting rules, and so CI installs and audits the frontend's dependencies.
- `template-configuration`: `project.config.json` declares the solution, source and test paths.
  The requirement changes to include an optional frontend path, so the layout keeps one owner and
  the frontend stages can tell "this repository has no frontend" from "the declared frontend is
  missing".

## Impact

- `frontend/package.json`, `frontend/package-lock.json`, `frontend/angular.json`,
  `frontend/tsconfig.json`, `frontend/tsconfig.spec.json`, and whatever the Angular migrations
  rewrite. No change to any component's behaviour, and no change to the routes.
- `frontend/src/app/app.component.spec.ts` — rewritten.
- `tools/lib/check.mjs` (stages), `tools/lib/generated.mjs` (the repository-map line that still
  says the frontend is out of scope), `tools/tests/check.test.mjs` and `tools/tests/config.test.mjs`.
- `project.config.json` and `project.config.schema.json` — both on the `ask` list, so both are a
  human-approved edit.
- `.github/workflows/pr.yml` — an install step in `checks`, an audit step in `dependency-scan`.
  Job names and the aggregate `required` job are unchanged, so the repository ruleset and
  `docs/github-setup.md` need no edit.
- `package.json` (`engines`), `openspec/project-context.md`, `CLAUDE.md` (generated region),
  `README.md`, `CONTRIBUTING.md`, `docs/sources-of-truth.md`, `docs/attribution.md`, and a new ADR.
- The build output path is unchanged (`dist/frontend/browser`), so `src/EscapeNow.Api/Program.cs`
  keeps finding the built frontend. This is asserted, not assumed — see the tasks.
- Runtime cost: `check` and the CI `checks` job grow by an Angular production build and a Vitest
  run. Removing Karma removes a browser launch from every run.
