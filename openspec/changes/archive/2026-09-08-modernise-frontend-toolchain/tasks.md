## 1. Angular 19 → 21 (LTS) in one pass, including the Vite builder

- [x] 1.1 Run `ng update @angular/core@21 @angular/cli@21` in `frontend/` and let the schematics
  apply, including the `@angular-devkit/build-angular` → `@angular/build` builder migration;
  verify `angular.json` names `@angular/build:application` for `build` and that no
  `@angular-devkit/build-angular` reference remains. If the CLI refuses the two-major jump, stop
  and report it rather than hand-editing `package.json`.
- [x] 1.2 Verify the application still builds: `node node_modules/@angular/cli/bin/ng.js build
  --configuration production` exits 0, stays inside the budgets in `angular.json`, and writes to
  `dist/frontend/browser` — the path `src/EscapeNow.Api/Program.cs` looks for.
- [x] 1.3 Verify the migration changed configuration only: review the diff under `frontend/src/`
  and stop and ask if a schematic rewrote component behaviour rather than syntax.

## 2. Pin what the upgrade resolved

- [x] 2.1 Verify `frontend/package.json` pins the framework packages at 21.2.22 and the CLI and
  build tooling at 21.2.23, with no caret or tilde range left on any Angular package.
- [x] 2.2 Pin TypeScript at 5.9.3, zone.js at 0.16.3 and rxjs at 7.8.2, and remove the unused
  `@angular/platform-browser-dynamic`; verify the production build still exits 0 and that
  `npm ls @angular/platform-browser-dynamic` reports it absent.
- [x] 2.3 Verify the pinned set satisfies every peer range: `npm ci` in `frontend/` completes with
  no peer-dependency error.

## 3. Karma out, Vitest in

- [x] 3.1 Replace the `test` target in `frontend/angular.json` with `@angular/build:unit-test`
  using the Vitest runner, add `vitest` 4.1.11 as a dev dependency, and remove `karma`,
  `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter`,
  `jasmine-core` and `@types/jasmine`; verify no `karma` or `jasmine` package remains in
  `frontend/package.json` or its lockfile's direct dependencies.
- [x] 3.2 Drop `types: ["jasmine"]` from `frontend/tsconfig.spec.json` and configure whatever the
  builder needs for Vitest's globals; verify the spec TypeScript project compiles.
- [x] 3.3 Rewrite `frontend/src/app/app.component.spec.ts` in Vitest form against the shell that
  exists — it creates, renders `app-navbar` and renders a `router-outlet` — and verify the test
  command reports three executed tests and no failures.
- [x] 3.4 Verify the run needs no browser and no human: the test command completes on a machine
  with no `CHROME_BIN` set and exits on its own without a watch prompt.
- [x] 3.5 Confirm the machine-readable result the check stage will consume — a Vitest JSON report
  written under `artifacts/` — and verify the file exists after a run and carries the executed and
  failed counts. If the builder cannot emit one, stop and record the fallback from `design.md`
  before writing the stage.

## 4. Give the frontend path an owner

- [x] 4.1 Add an optional `paths.frontend` to `project.config.json` and
  `project.config.schema.json`; verify `node tools/repo.mjs doctor` reports the configuration as
  valid and exits 0.
- [x] 4.2 Verify the schema constrains it and keeps it optional: cases in
  `tools/tests/config.test.mjs` reject an absolute path and a backslash path, and accept a
  configuration that declares no frontend at all.

## 5. Add the stages to the one check entry point

- [x] 5.1 Add a `frontend:build` stage to `tools/lib/check.mjs` that runs the Angular CLI through
  `process.execPath` with the frontend directory as `cwd`, and add it to `STAGE_NAMES` in the order
  the spec delta declares; verify `node tools/repo.mjs check` lists the stage with its exact
  command line.
- [x] 5.2 Add a `frontend:test` stage the same way, reading the executed and failed counts from the
  Vitest report; verify the summary line reports the executed test count.
- [x] 5.3 Make `frontend:test` fail when the report is missing, unparseable, or reports zero
  executed tests; verify with cases in `tools/tests/check.test.mjs` covering a passing report, a
  failing report, a zero-test report, an unparseable file and an absent file.
- [x] 5.4 Make a declared-but-absent frontend and an uninstalled frontend fail with the install
  command named, and an undeclared `paths.frontend` report `not-configured`; verify all three with
  cases in `tools/tests/check.test.mjs`.

## 6. Let CI run and scan what the check now requires

- [x] 6.1 Add an install step to the `checks` job in `.github/workflows/pr.yml` whose `run:` is
  exactly `npm ci` with `working-directory: frontend`, and extend `cache-dependency-path` on
  `setup-node` to both lockfiles; verify `node tools/repo.mjs check` keeps the `workflows` stage
  green, which is what asserts the step-command policy.
- [x] 6.2 Add a frontend audit to the `dependency-scan` job — `npm ci` then `npm audit
  --audit-level=high`, both with `working-directory: frontend` — and verify the `workflows` stage
  stays green with no widening of `ALLOWED_STEP_COMMANDS`.
- [x] 6.3 Set `engines.node` in the root `package.json` to the Node 24 LTS line and verify
  `node tools/repo.mjs doctor` reports the running Node as satisfying it.
- [x] 6.4 Verify the required check names are unchanged: the job list and the aggregate `required`
  job are untouched, so `docs/github-setup.md` needs no edit.

## 7. Record the decision and stop documenting the frontend as out of scope

- [x] 7.1 Write an ADR for the move to `@angular/build` and Vitest, covering why Karma was dropped
  and why Angular 21 rather than 22; verify it is listed in `docs/adr/README.md`.
- [x] 7.2 Add the licences of every package this change introduces to `docs/attribution.md`; verify
  each added package appears there with its licence.
- [x] 7.3 Update `openspec/project-context.md` and the repository-map line in
  `tools/lib/generated.mjs`, then run `node tools/repo.mjs sync`; verify `check` reports no drift
  in the generated regions of `CLAUDE.md` and `openspec/config.yaml`.
- [x] 7.4 Update `README.md`, `CONTRIBUTING.md` and `docs/sources-of-truth.md` for the frontend
  install step, the Node 24 requirement and the owner of `frontend/package-lock.json`; verify a
  reader following `README.md` alone can get `check` to pass from a fresh clone.

## 8. Verify the whole change

- [x] 8.1 Run `node tools/repo.mjs check` and record the exact per-stage outcome: every stage
  passes, twelve stages are reported, and no stage is `not-configured`.
- [x] 8.2 Prove the new gate can fail: temporarily break one frontend test and one template type,
  confirm `frontend:test` and `frontend:build` each fail the run, then revert both and re-run.
- [x] 8.3 Verify the API still serves the built frontend: build the frontend, run the API, and
  confirm it finds `frontend/dist/frontend/browser` and serves `index.html` at `/`.
- [x] 8.4 Run `/opsx:verify` and stop for human code review.
