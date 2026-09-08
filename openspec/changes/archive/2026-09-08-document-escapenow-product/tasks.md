## 1. Agent context

- [x] 1.1 Replace the “what this repository is” paragraph in `CLAUDE.md` so it no longer forbids
      example domain modules, names EscapeNow’s city-break slice, and points product behaviour at
      `openspec/specs/`. Leave the generated `project-context` region untouched. Verify the file
      still points at `project.config.json`, `docs/ARCHITECTURE.md`, and `CONTRIBUTING.md`, and
      that `node tools/repo.mjs check`’s `agent-config` stage still passes.

## 2. Planning context

- [x] 2.1 Add Angular (`frontend/`) and Open-Meteo as environment lines in
      `openspec/project-context.md` without copying product requirements. Run
      `node tools/repo.mjs sync` and verify the generated region in `openspec/config.yaml`
      matches, and that the `config` stage of `check` reports no drift.

## 3. Contract check

- [x] 3.1 Run `node tools/repo.mjs openspec validate --all --strict` and verify the three new
      delta specs (`city-break-scoring`, `destination-recommendations`, `discovery-ui`) validate.
- [x] 3.2 Run `node tools/repo.mjs check` and verify every configured stage is `passed` (not
      treated as a pass if skipped). Confirm no production, test, or `frontend/` files were
      modified by this change.
