# Updating the SDK, OpenSpec and the agent configuration

Every upgrade here is a **Standard** change: it alters what the software is, so a small diff does
not make it Trivial. See `CONTRIBUTING.md`.

Before starting, get to a known-good state:

```bash
node tools/repo.mjs check
```

An upgrade on top of a failing check tells you nothing about the upgrade.

## The .NET SDK

Owned by `global.json`. Nothing else declares it — no CI YAML, no `project.config.json`.

```jsonc
{
  "sdk": { "version": "10.0.300", "rollForward": "latestPatch", "allowPrerelease": false },
  "test": { "runner": "Microsoft.Testing.Platform" }
}
```

`rollForward: latestPatch` pins the feature band (10.0.3xx) and accepts patches within it. A
feature-band move — 10.0.3xx to 10.0.4xx — is an explicit edit, because a feature band can change
analyzer behaviour and the build treats warnings as errors.

```bash
# 1. Edit the version in global.json.
# 2. Confirm the SDK resolves from the repository root:
dotnet --version
# 3. CI needs no change: actions/setup-dotnet reads global.json.
node tools/repo.mjs check
```

What tends to break, in order of likelihood:

1. **New analyzer warnings.** They are errors here. Fix them, or suppress at the source with a
   justification in `.editorconfig` next to the existing two — never repository-wide.
2. **`dotnet format` disagreeing with the previous version.** Run
   `node tools/repo.mjs format --write` and read the diff before committing it.
3. **Test runner behaviour.** Re-read the `test.runner` block if `dotnet test` starts reporting
   differently. Do not reach for a VSTest flag to make it work — see ADR 0002.

## NuGet packages

Owned by `Directory.Packages.props`. Central package management is on, so a `Version=` on a
`PackageReference` is a build error rather than a second source of truth.

```bash
dotnet list package --outdated
dotnet list package --vulnerable --include-transitive
```

Then edit `Directory.Packages.props`, pinning exactly — no floating range — and:

```bash
dotnet restore --force-evaluate    # refreshes packages.lock.json
node tools/repo.mjs check
```

`packages.lock.json` is committed and CI restores in locked mode, so a forgotten
`--force-evaluate` fails CI rather than resolving differently there.

Two obligations for any new or changed package:

- **It must be free in every configuration** — no licence key, no paid tier, no per-seat
  entitlement, no "free for individuals". See `docs/adr/0007-free-dependencies-only.md`.
- **Record its licence** in `docs/attribution.md`.

### ArchUnitNET specifically

Pinned at 0.13.4, which is pre-1.0, and a `2.1.0-draft` exists. On upgrade, check three things
beyond the build:

1. The negative fixture tests still fail on their fixtures. If a rule stops detecting its
   violation, the upgrade broke the rule, not the fixture.
2. `NegativeFixtureTests.ArchUnitNET_itself_rejects_an_empty_selection` still passes. It documents
   that the library fails a rule whose selection is empty; if that behaviour goes away,
   `RuleGuard`'s own non-empty check becomes the only protection and every rule needs re-checking.
3. The skipped count under `architecture.profile: custom` is unchanged.

## OpenSpec

Owned by `package.json` plus `package-lock.json`. Never installed globally, and `latest` is never
fetched during a check.

```bash
npm outdated @fission-ai/openspec
```

```bash
# 1. Edit the exact version in package.json.
npm install
# 2. Regenerate the Claude Code integration:
node tools/repo.mjs openspec update
# 3. Verify:
node tools/repo.mjs doctor
node tools/repo.mjs check
```

`openspec update` regenerates `.claude/commands/opsx/**` and `.claude/skills/openspec-*/**`.
Verified against 1.12.0: it leaves `openspec/config.yaml` byte-identical, which is why the project
context lives there and not in a file the CLI owns.

Three things to re-verify after an OpenSpec upgrade, because the template depends on them:

1. **The project-local install still works.** Upstream documents only a global install, so this is
   a supported-but-undocumented arrangement — see ADR 0004. `node tools/repo.mjs doctor` fails if
   the local CLI is not invocable.
2. **`openspec list --json` still returns `{ "changes": [...], "root": { "path": ... } }`.** The
   archive gate depends on that shape and fails closed if it changes — which is the correct
   outcome, but you will want to know why.
3. **`openspec update` still does not touch `openspec/config.yaml`.** The `config` stage's drift
   check catches it if it starts to, and `sync` restores the region.

### The `verify` workflow is machine-wide, not per-project

This one catches people, so it is worth being explicit.

OpenSpec resolves the installed workflow set from **global** configuration
(`%APPDATA%/openspec/config.json` on Windows, `~/.config/openspec/` elsewhere — `openspec config
path` prints it). Read from the pinned version's `dist/core/profiles.js`:

- the `core` profile is `[propose, explore, apply, update, sync, archive]` — **`verify` is not in
  it**;
- `verify` exists only in the full workflow list and must be added to a `custom` profile;
- `openspec init --profile` accepts only `core|custom` and still takes the custom workflow *list*
  from global configuration.

So **there is no per-project override.** A contributor whose machine does not include `verify` will
not have `/opsx:verify`, even in this repository.

```bash
node tools/repo.mjs openspec config list        # what your machine is set to
node tools/repo.mjs openspec config profile     # interactive: add `verify`
node tools/repo.mjs openspec update             # regenerate this project's integration
```

**The template will not do this for you**, and neither should any script in it: it changes a
setting that affects every OpenSpec project on the machine. `node tools/repo.mjs doctor` detects
the absence and prints the opt-in instruction; the `specs` check stage reports it as a finding.
Neither one changes your configuration.

If you add `verify` to a shared machine, tell the other people using it.

## The agent configuration

`.claude/settings.json`, `.claude/agents/**`, `.claude/hooks/**`, `.claude/rules/**` and `.mcp.json`
are maintained by the team. `openspec update` does not touch them.

```bash
node tools/repo.mjs check      # the agent-config stage validates all of it
```

The stage fails on a missing hook script, a hook without an explicit timeout, a forbidden setting,
an ineffective path rule, a hardcoded model identifier, a broken path reference in `CLAUDE.md`, a
command colliding with a skill name, or a credential shape in a committed file.

When Claude Code itself changes:

1. Re-read the hook schema. The settings file declares `type: command` hooks with explicit
   timeouts; a new event or field is opt-in, not automatic.
2. Re-read the permission rule semantics. The template relies on two documented behaviours: file
   access is matched only against `Read(...)` and `Edit(...)` rules, and `defaultMode` values
   `auto` and `bypassPermissions` do not take effect from project settings. Both are asserted by
   the `agent-config` stage; if either changes, `SECURITY.md` needs updating too.
3. Do not add a model name to an agent definition. `model: inherit` is deliberate — see the
   `agent-config` check, which fails on a literal model identifier.

## GitHub Actions

Pinned by commit SHA in `.github/workflows/`. Resolve the SHA for the tag you want:

```bash
gh api repos/actions/checkout/git/ref/tags/v7.0.1 --jq .object.sha
# or, without gh:
curl -s https://api.github.com/repos/actions/checkout/git/ref/tags/v7.0.1 | grep '"sha"'
```

Update the SHA **and** the `# vX.Y.Z` comment beside it — the comment is the only readable record
of which version a SHA is.

`gh` is not a dependency of this repository. It was not installed on the machine where the template
was built, and no check requires it.

## The gitleaks binary

CI downloads a version-pinned release and verifies it against a SHA-256 recorded in the workflow.
On upgrade, update **both** the version and the checksum:

```bash
VERSION=8.31.0
curl -sL "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz" \
  | sha256sum
```

A mismatch fails the job **without executing the binary**. That is the point of the checksum, so
never work around a mismatch by removing the check — investigate it.

## After any upgrade

```bash
node tools/repo.mjs doctor
node tools/repo.mjs check
```

Report what actually ran. If an upgrade left a stage failing and you shipped anyway, say so in the
change — a known failure that is written down can be fixed; one that was reported as green cannot.
