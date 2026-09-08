# 0004. OpenSpec as a project-local, pinned dev dependency

Status: accepted
Date: 2026-09-07

## Context

OpenSpec had to be really installed and initialized — not replaced by a handful of Markdown files
that look like it. The requirement was a pinned version, a lockfile, invocation of the local CLI,
no global installation, and no fetching `latest` on every check.

The published installation guide documents **global installation only**:

```
npm install -g @fission-ai/openspec@latest
```

No project-local method is documented.

## Decision

`@fission-ai/openspec` as an exact `devDependencies` pin (1.12.0) with `package-lock.json`,
installed by `npm ci`.

The CLI is invoked without a shell and without `npx`:

```
process.execPath  node_modules/@fission-ai/openspec/bin/openspec.js  <args...>
```

## Consequences

- Every developer and CI run uses the same CLI version, and the archive gate reads output from a
  version the repository declares. `latest` is never fetched during a check.
- The invocation form works identically on Windows, Linux and macOS. It needs no `PATH` entry and
  it sidesteps the Windows `.cmd` shim entirely, which is where shell-free spawning of npm binaries
  normally breaks.
- The `specs` check stage compares the installed version against the lockfile and fails on a
  mismatch, so a stale `node_modules` cannot silently change what the gate reads.
- **Divergence from upstream documentation is accepted.** A future release could assume a global
  install. Mitigated by the exact pin and by the tooling tests, which fail if local invocation
  stops working. `docs/updating-dependencies.md` says to re-verify this on upgrade.
- Implementation note recorded because it cost time: the package does not export `./package.json`,
  so its version must be read by file path or from the lockfile, never with
  `require('@fission-ai/openspec/package.json')`.

Verified against 1.12.0: a project-local install works, `init --tools claude --language en
--no-animation` runs non-interactively, and the machine-wide configuration file is byte-identical
before and after (SHA-256 compared) — `init` does not modify the user's settings.

Also verified: `openspec update --force` regenerates `.claude/commands/opsx/**` and
`.claude/skills/openspec-*/**` and leaves a hand-edited `openspec/config.yaml` byte-identical. That
is why the project context is injected into `config.yaml` and not into a file the CLI owns.

## The `verify` workflow is machine-wide

Read from `dist/core/profiles.js` of the pinned version:

- `CORE_WORKFLOWS = [propose, explore, apply, update, sync, archive]` — `verify` is **not** in it.
- `verify` exists only in `ALL_WORKFLOWS` and must be added to a `custom` profile.
- `openspec init --profile` accepts only `core|custom` and still takes the custom workflow *list*
  from global configuration.

So there is **no per-project override**: `/opsx:verify` is available only if the machine-wide
profile includes it. This repository's owner consented to adding `verify` (and `update`) to their
profile, and a timestamped backup of the previous file was kept.

Consequence to live with: a contributor whose machine lacks `verify` will not have the command.
`node tools/repo.mjs doctor` detects that and prints the opt-in instruction; the `specs` check
stage reports it as a finding. Neither one changes the contributor's global configuration — the
template must not silently alter a setting that affects every OpenSpec project on a machine.

## Alternatives considered

**Global install, as documented.** Rejected: it makes the CLI version an unversioned property of
whichever machine ran the check, which is exactly what the archive gate must not depend on.

**`npx @fission-ai/openspec@1.12.0`.** Rejected: it resolves through a shim, and without a warm
cache it fetches at check time — a check that needs the network to answer is not a local check.

**Vendor the CLI into the repository.** Rejected: it makes upgrades manual and licence tracking
worse, for no benefit over a lockfile.

**Write our own Markdown workflow instead.** Rejected outright. It was the failure mode the
requirement named: a set of files that look like OpenSpec and are not, with no `verify`, no
validation and no archive semantics.
