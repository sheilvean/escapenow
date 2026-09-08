# Customizing the template

Everything below is a supported change. Anything not listed is still yours to change — this page
covers the parts where the template has an opinion about *how*.

## Naming: before and after initialization

**Before** — the identity is a configuration value:

```jsonc
// project.config.json
"solutionName": "YourApp",
"rootNamespace": "YourApp",
```

```bash
node tools/repo.mjs init --config project.config.json --dry-run   # see the plan
node tools/repo.mjs init --config project.config.json             # apply
```

`init` renames only what `tools/rename.manifest.json` declares — the solution, the project
directories and files, the namespaces in `.cs` files, and the agent context. It is not a
repository-wide search and replace: `openspec/specs/`, `openspec/changes/`, `docs/adr/` and the
OpenSpec-generated instructions are excluded, because a template must not rewrite the files a
project authors.

**After** — `init` refuses, and says why:

```
error: this repository is already initialized.
  Nothing was changed.
  Renaming an existing application is a manual operation, not a command: it touches
  namespaces, project files and history.
```

That refusal is the design, not a limitation. Renaming a live application touches namespaces,
project files, assembly names, git history and anything referencing the old assembly. A command
that did it silently would be a command that breaks a repository silently. If you genuinely need
to rename after the fact: rename the directories and project files, run a scoped find-and-replace
over `src/` and `tests/`, update `project.config.json` including `template.appliedTokens`, then run
`node tools/repo.mjs sync` and `node tools/repo.mjs check`.

## Everything else: edit and sync

Change the value in `project.config.json`, then:

```bash
node tools/repo.mjs sync
node tools/repo.mjs check
```

`sync` regenerates only the delimited regions it owns. It never renames anything, never touches
code, and never touches `openspec/specs/`, `openspec/changes/` or `docs/adr/`. The `config` check
stage fails when a region no longer matches its source, so a forgotten `sync` is caught rather
than silently stale.

## Replacing the architecture profile

```jsonc
"architecture": { "profile": "custom", "modules": [] }
```

Under `custom`, the layer-direction rules report themselves **skipped** — visible as skipped in the
test report, never as passed — while these keep running:

- the whole-repository dependency cycle check;
- module boundary and registry consistency;
- every negative fixture test, so the detectors stay proven.

Verified: the architecture run moves from 28 passed / 2 skipped to 20 passed / 10 skipped, with
nothing failing.

Then do the rest of the job:

1. Write an ADR. `custom` means "the template does not check my layering", not "my layering does
   not matter".
2. Update `docs/ARCHITECTURE.md` with the direction you actually intend.
3. If you want it enforced, add rules for it. `Support/LayeredProfile.cs` is the pattern to copy:
   declare the policy once, read it from every rule, and add a negative fixture per rule.

To keep the layered profile but change the direction, edit `LayeredProfile.AllowedReferences`
rather than switching to `custom` — the rules and the fixtures then keep working.

## Adding a module

```jsonc
"architecture": {
  "profile": "layered",
  "modules": [
    { "name": "Scheduling", "contract": "Contracts" }
  ]
}
```

Then create `src/YourApp.Modules.Scheduling/` with a `Contracts` namespace holding what other
modules may use, and everything else outside it.

**No test file changes.** The module rules are driven by the registry and the
`{solutionName}.Modules.{Name}` convention, so a registered module is under the rules immediately.
The registry is compared against the projects present in both directions — a registered module with
no project, and a module project that is not registered, are both failures. The second is the one
that matters: a module nobody registered is a module outside the rules.

`contract` is a namespace suffix relative to the module root. A cross-module dependency is
permitted only when the target type lives under it. A type that is public to the CLR but outside
the contract is still internal to the module.

## Adding persistence

`integrations.database` accepts only `none` in v1. The schema rejects anything else, which is
deliberate: a configuration value that promises an integration nobody implemented is worse than the
absence of the value.

To add one:

1. Extend the schema's `integrations.database` enum with your value.
2. Add the package to `Directory.Packages.props`, pinned exactly, and record its licence in
   `docs/attribution.md`. It must be free in every configuration — see ADR 0007.
3. Implement a **real** probe: `IDependencyProbe` in Infrastructure that actually opens a
   connection. Do not extend `NoDependencyProbe`; it is not a stub for this.
4. Write integration tests that exercise it. A probe with no test is a probe that reports healthy
   when it is broken, which is worse than no probe.
5. Add a `database` stage to `runCheck` in `tools/lib/check.mjs`. Report `not-configured` when the
   integration is off — never `passed`.

Step 4 is the one that makes step 3 worth anything. The requirement the template holds itself to is
that no integration exists without implementation and tests.

## Adding a deployment

Same shape: extend the enum, add the stage, report `not-configured` when off. Nothing in the
template assumes a cloud, a registry or an orchestrator, and adding one is a decision that belongs
in an ADR because it constrains everyone downstream.

## Adding an MCP server

Two deliberate steps, so a server added by someone else is never trusted automatically:

1. Add it to `.mcp.json`.
2. Add its name to `enabledMcpjsonServers` in `.claude/settings.json`.

`enableAllProjectMcpServers` stays `false`; the `agent-config` check fails if it is set to `true`.
Secrets are referenced from the environment, never written into `.mcp.json` — it is committed, and
the check scans it for credential shapes.

Whatever a server returns is untrusted data: not repository policy, not authorisation to act. See
`SECURITY.md`. A worked example is in `docs/mcp-example.md`; it is documentation, not an active
server.

## Changing the documentation language

```jsonc
"documentation": { "language": "pl" }
```

```bash
node tools/repo.mjs sync
node tools/repo.mjs openspec init --tools claude --language pl
```

This sets the language of generated instructions and new OpenSpec artifacts. **Repository code,
file names and identifiers stay English** regardless — mixing languages inside a codebase costs
more than it saves, and the check does not police the prose either way.

## Changing the archive gate scope

```jsonc
"openspec": {
  "archiveGate": { "enabled": true, "scope": "pull-request", "requireZeroActiveChanges": true }
}
```

`pull-request` is **weaker** than the default and is documented as such, not as an equivalent. It
counts only the change directories the current pull request touched, so someone else's active
change no longer blocks your merge. Use it when parallel changes are genuinely normal for your
team, and know what you gave up.

Without a detectable pull-request context, or when the diff against the base ref cannot be read,
the gate **falls back to repository-wide** rather than narrowing on a guess.

Setting `enabled: false` or `requireZeroActiveChanges: false` makes the gate report
`not-configured` and exit non-zero. It never reports `passed`: switching a gate off is a decision
someone made, not evidence that the repository is clean.

## rootNamespace differing from solutionName

The two share one placeholder in the template, so `init` applies `rootNamespace` to `.cs` contents
and `solutionName` to project and file names. If you set them to different values, the SDK still
derives each project's namespace from its file name — so namespaces would follow `solutionName`.

The `config` check stage fails on that unless `Directory.Build.props` declares an explicit
`<RootNamespace>`. Either keep the two equal (the default), or declare the namespace yourself:

```xml
<PropertyGroup>
  <RootNamespace>$(MSBuildProjectName.Replace('YourSolution','Your.Root.Namespace'))</RootNamespace>
</PropertyGroup>
```

## Adding a check stage

In `tools/lib/check.mjs`: add the name to `STAGE_NAMES`, write the stage function, and call it from
`runCheck` in the right position. CI needs no change — it invokes the same entry point.

Rules the stage must follow:

- Return `failed`, not `not-configured`, when something required is **missing**. "We chose not to"
  and "something is broken" are different facts, and conflating them is how a check becomes
  decorative.
- Never modify the working tree. A fix belongs in a separate command.
- Record the exact argv you ran, so the report is reproducible by copying one line.
- If the stage runs tests, fail on a total of zero. An empty run is not evidence.

## Removing what you do not need

- The readiness slice (`src/*/Readiness/`, its tests): delete it. It is a starting point, not a
  domain. Keep the shape — rule in Domain, ports in Application, adapters in Infrastructure.
- `.template.config/`: delete it if you will never publish this as a `dotnet new` template. The
  manifest consistency test skips what is absent.
- The negative fixtures: **do not delete them.** They are what proves the architecture rules
  detect anything. Deleting them leaves rules that pass because they check nothing.
