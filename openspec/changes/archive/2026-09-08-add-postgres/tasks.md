## 1. Declare the integration and the Compose file

- [x] 1.1 Add `compose.yaml` at the repository root with service `postgres`, image `postgres:18.6`,
  published `5432:5432`, and `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` all `escapenow`;
  verify `docker compose config` exits 0 and the rendered image tag is exactly `postgres:18.6`.
- [x] 1.2 Extend `project.config.schema.json` so `integrations.database` is `none` or `postgres`,
  set this repository to `postgres`, and add cases in `tools/tests/config.test.mjs` that accept
  `postgres` and reject an unknown value; verify `node tools/repo.mjs doctor` reports the
  configuration as valid.
- [x] 1.3 Update `openspec/project-context.md` for the Postgres integration, run
  `node tools/repo.mjs sync`, and verify the generated regions of `CLAUDE.md` and
  `openspec/config.yaml` match.

## 2. Connection string and ready probe

- [x] 2.1 Pin the current Npgsql that supports `net10.0` in `Directory.Packages.props` and
  reference it from `EscapeNow.Api` only; verify `dotnet restore` succeeds and
  `EscapeNow.Domain` / `EscapeNow.Application` have no Npgsql reference.
- [x] 2.2 Add `ConnectionStrings:EscapeNow` to `appsettings.Development.json` matching compose,
  leave production without a committed password, and wire the Testing host to the same
  environment variable CI will use; verify the Development file contains the demo credential and
  `appsettings.json` does not.
- [x] 2.3 Register a host health check that `SELECT 1` through Npgsql, map `/health/live` with a
  predicate that includes no checks, and map `/health/ready` including the postgres check;
  verify a running API with compose up returns 200 on both, and that stopping Postgres makes
  ready non-200 while live stays 200.
- [x] 2.4 Keep `Readiness_answers_once_the_process_has_started` asserting 200 against a reachable
  instance, and keep liveness asserting 200; verify `dotnet test tests/EscapeNow.IntegrationTests`
  with compose up reports those tests succeeded.

## 3. The database check stage

- [x] 3.1 Pin `pg` (MIT) exactly in the root `package.json` / lockfile and add
  `tools/lib/postgres-ping.mjs` that runs `SELECT 1` using
  `ConnectionStrings__EscapeNow` or the Development default as a URI; verify a manual run against
  compose up prints success and a run with Postgres stopped exits non-zero.
- [x] 3.2 Add a `database` stage to `tools/lib/check.mjs` after `test:arch` and to `STAGE_NAMES`;
  when `integrations.database` is `none` report `not-configured`; when `postgres` run the ping
  and on failure name `docker compose up -d`; verify cases in `tools/tests/check.test.mjs` cover
  none, a successful ping, and a refused connection.
- [x] 3.3 Add the `postgres:18.6` service container and connection-string env to the `checks` job
  in `.github/workflows/pr.yml` only; verify the image tag matches `compose.yaml`, required job
  names are unchanged, and `node tools/repo.mjs check` keeps the `workflows` stage green.

## 4. Record the decision and the local path

- [x] 4.1 Write ADR 0009 for Postgres 18.6, Rancher Desktop with dockerd, Compose, and no EF;
  verify it is listed in `docs/adr/README.md`.
- [x] 4.2 Add licence rows for Npgsql, `pg`, PostgreSQL, and Rancher Desktop to
  `docs/attribution.md`; verify each appears with its licence.
- [x] 4.3 Update `README.md`, `CONTRIBUTING.md` and `docs/sources-of-truth.md` for Rancher Desktop
  (dockerd), `docker compose up -d`, the demo credential, and the owner of the image tag; verify
  Docker Desktop is not named as the runtime.

## 5. Verify the whole change

- [x] 5.1 With compose up, run `node tools/repo.mjs check` and record the exact per-stage outcome:
  every configured stage passes, `database` is not `not-configured`, and architecture tests still
  pass.
- [x] 5.2 With compose down, run `node tools/repo.mjs check` and verify `database` fails naming
  `docker compose up -d`, then bring compose back up.
- [x] 5.3 Confirm Domain and Application still have no EF or `System.Data` references, no
  destination or trip table exists, and the save control still does not persist; verify by
  inspecting the catalog path and the destination page handler.
- [x] 5.4 Run `/opsx:verify` and stop for human code review.
