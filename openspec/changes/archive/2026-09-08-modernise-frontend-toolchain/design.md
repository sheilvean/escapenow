## Context

See `proposal.md` — Why. What shapes the approach:

**Versions, read from the npm registry on 2026-09-08, not from memory.** `@angular/core` carries a
`v21-lts` dist-tag at **21.2.22** while `latest` is 22.1.5, so Angular 21 is the current LTS line
and 22 is the active one — 21 is the target. `@angular/build` and `@angular/cli` are at **21.2.23**
in that line. `@angular/compiler-cli@21.2.22` requires `typescript >=5.9 <6.1` and
`@angular/build@21.2.23` narrows it to `>=5.9 <6.0`, so **TypeScript 5.9.3**. `@angular/core@21.2.22`
declares `engines.node: ^20.19.0 || ^22.12.0 || >=24.0.0` and `zone.js: ~0.15.0 || ~0.16.0`.
`@angular/build` lists **`vitest: ^4.0.8`** as an optional peer — Vitest's `latest` is 5.0.0, which
is outside that range, so the target is **vitest 4.1.11**, the newest 4.x. Karma remains an
optional peer of `@angular/build`; keeping it would be a choice, and this change chooses not to.

**Constraints already in the repository.** `tools/lib/proc.mjs` spawns with `shell: false`, so a
`.cmd` shim such as `ng.cmd` or `npm.cmd` cannot be launched from a stage — the OpenSpec stage
already solves this by invoking `process.execPath` with a CLI's JavaScript entry point.
`tools/lib/workflows.mjs` allows a workflow `run:` step to be exactly `npm ci`, `npm audit …`,
`dotnet restore`, `dotnet list package …` or `node tools/…mjs …`, and rejects multi-line scripts
that are not named plumbing. `docs/sources-of-truth.md` gives paths one owner. `check` distinguishes
`passed`, `failed` and `not-configured`, and zero executed tests is a failure.

**Current frontend.** `main.ts` already bootstraps with `bootstrapApplication`, so
`@angular/platform-browser-dynamic` is dead weight. `tsconfig.spec.json` declares `types: ["jasmine"]`.
`angular.json` uses `@angular-devkit/build-angular:application` for build, `:dev-server` for serve
and `:karma` for test, with `outputPath: dist/frontend`. The only spec file is the broken one.

## Goals / Non-Goals

**Goals:**

- The frontend runs on the current Angular LTS line, on the toolchain Angular actually supports.
- A unit-test run that needs no browser process and no human.
- One command whose green result covers both halves of the application.
- Exact, pinned versions everywhere, and a lockfile CI installs from.

**Non-Goals:**

- Any change to what the application does. No component behaviour, no routes, no API contract.
- Zoneless change detection, standalone-migration cosmetics, or a UI redesign carried in on the
  back of the upgrade.
- ESLint. It is a separate dependency decision with its own attribution entry.
- Angular 22. It is the active line, not the LTS one, and the repository's stated policy is LTS.
- Making the frontend part of the .NET solution or of a single deployable artifact.

## Decisions

**Upgrade straight from 19 to 21, through `ng update`. Decided by the human on 2026-09-08**,
overriding the stepwise 19 → 20 → 21 plan this document originally carried. The trade-off is
accepted knowingly: `ng update` normally wants one major at a time, and a direct jump means the
v20 schematics and the v21 schematics apply in one pass with no green checkpoint between them, so
a regression is attributable to "the upgrade" rather than to one major. If the CLI refuses the
two-major jump outright, that is reported and the human decides — it is not worked around by
hand-editing `package.json`, which would skip every migration.

**Migrate the builder to `@angular/build` in the same pass.**
Angular's own migration moves `@angular-devkit/build-angular:application` to `@angular/build:application`;
doing it by hand afterwards would duplicate work the schematic does correctly. `outputPath` stays
`dist/frontend`, so the built files stay at `dist/frontend/browser` — which is the path
`src/EscapeNow.Api/Program.cs` looks for. That is asserted by a task, not assumed.

**Test target becomes `@angular/build:unit-test` with `runner: vitest`.**
This is the supported successor, it reuses the same Vite build pipeline as `build`, and it runs in
a simulated DOM rather than a launched browser. Consequences taken deliberately:
- The tests no longer execute in a real browser engine. For a shell that renders a navbar and an
  outlet this costs nothing; when a test genuinely needs a real engine, Angular's builder can be
  pointed at one, and that will be an argued change.
- `tsconfig.spec.json` drops `types: ["jasmine"]`. Jasmine's globals are gone; Vitest's are
  configured through the builder.
- Alternative considered: keep Karma, since Angular 21 still accepts it as an optional peer.
  Rejected — it is the deprecated path, it is the reason a test run needs Chrome on the machine,
  and keeping it means doing this migration again later.

**The frontend path is declared in `project.config.json` as `paths.frontend`, optional.**
Optional, because a repository with no browser application must stay valid and report the stages
as `not-configured`. Declared, because then a missing directory is a *failure* rather than a stage
that quietly disappears. Alternative: hardcode `frontend` in `tools/lib/check.mjs` — rejected,
`tools/` reads configuration rather than restating a project's layout. Alternative: infer from the
directory existing — rejected, because deleting the directory would then turn the stages green.
`project.config.json` and its schema are on the `ask` list, so this is a human-approved edit.

**Two stages, `frontend:build` and `frontend:test`, invoked through `process.execPath`.**
`run(process.execPath, ['node_modules/@angular/cli/bin/ng.js', …], { cwd: frontendDir })` — the
shape the OpenSpec stage already uses, so `shell: false` holds and the reported command is the real
one. Two stages rather than one, so a build failure and a test failure do not share a report line.

**The test stage reads a machine-readable result, not console prose.**
Vitest is asked for a JSON reporter written to a file under `artifacts/`, and the stage reads the
executed/passed/failed counts from it. Parsing a runner's human output is what the .NET stage has
to do, and its own tests exist because that parser broke once on colour codes. Where a structured
result is available, use it. The stage fails when the file is missing, unparseable, or reports zero
executed tests — an unknown outcome is not a good one. This is the one place the design depends on
a detail to be confirmed against the installed builder; the fallback, if the builder cannot be made
to emit a report file, is a parser over its output with its own tooling tests, which changes no
requirement.

**CI: one `npm ci` step with `working-directory: frontend`.**
The command string is exactly `npm ci`, so `ALLOWED_STEP_COMMANDS` needs no widening — the workflow
policy is not relaxed to accommodate this change. `cache-dependency-path` on `setup-node` is
extended to both lockfiles. The frontend audit step reuses the existing `Node vulnerabilities`
plumbing name with a second step under the same working directory.

**Node moves to `>=24.0.0` in `package.json` `engines`.**
`setup-node` reads that file, so the Node line has one owner. Angular 21 would accept 20.19 or
22.12; the repository picks the current LTS instead of the oldest tolerated version.

**An ADR records the builder and runner switch**, because it is durable and someone will ask why
there is no Karma. `docs/attribution.md` gains the licences for what is added (Vitest, MIT).

## Risks / Trade-offs

- **Two majors of migrations land in one pass**, so a regression is attributable to the upgrade
  rather than to a single major → mitigated by reviewing the diff under `frontend/src/` before
  anything else is changed, and by stopping to ask if a schematic rewrote component behaviour
  rather than syntax. The human chose this trade-off deliberately.
- **The test stage is introduced at the same time as the runner it measures**, so a green stage
  could mean "Vitest ran nothing". → The zero-executed-tests failure and the deliberately broken
  test in the verification task are what close that hole; neither is optional.
- **Vitest 4 with Angular 21 is a supported but recent pairing**, and the builder's report options
  are the least certain part of this plan → confirmed against the installed builder during
  implementation; the fallback is written down above and needs no new requirement.
- **`check` gets slower** by a production build plus a Vitest run, offset by no longer launching a
  browser → accepted; the alternative is not knowing whether the frontend works.
- **Node 24 is now required of contributors** → stated in `README.md` and `CONTRIBUTING.md`, and
  `doctor` already reports the Node version it found.
- **The upgrade needs the npm registry** → a human authorises it in the conversation; the resulting
  lockfile is committed, so CI and every later run install exactly what was reviewed.

## Migration Plan

Ordered so the tree is never left in a state where a stage exists that cannot run:

1. Angular 19 → 21 in one `ng update` pass, including the `@angular/build` builder migration.
   Verify the production build runs.
2. Pin the resolved versions exactly and drop the packages the upgrade makes redundant.
3. Swap the test target to `@angular/build:unit-test` with Vitest, remove Karma and Jasmine, and
   rewrite `app.component.spec.ts`. Verify the tests run and fail when they should.
4. Add `paths.frontend`, then the two check stages, then their tooling tests.
5. Add the CI install and audit steps.
6. Documentation, ADR, attribution, generated regions.

Rollback is the revert of this change: `frontend/package.json`, its lockfile and `angular.json`
return to Angular 19 with Karma, and the stages and the config entry disappear together.

## Open Questions

- Whether the frontend stage should later publish coverage. Deferred: it changes no requirement
  here, and this repository imposes no coverage threshold anywhere.
