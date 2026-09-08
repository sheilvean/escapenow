## REMOVED Requirements

### Requirement: Two start paths over one set of sources

**Reason**: The repository is no longer a template. The `dotnet new` descriptor and the
GitHub-template path are removed, so there is no second start path to keep consistent with the
first, and `tools/tests/rename-manifest.test.mjs` no longer has two manifests to compare.

**Migration**: None. Generating an application from this repository is no longer supported. A
future template would be a separate repository seeded from this one, not a mode of this one.

### Requirement: Targeted renaming

**Reason**: `project.config.json` already records the rename as applied, so the rename engine could
only ever run again by first undoing itself. The generator test suite did exactly that — it
reversed the applied name inside a temporary copy so `init` could be run forward again — which is
maintenance with no product beneficiary.

**Migration**: Renaming the solution is now a manual operation: edit `project.config.json`, the
solution file, the project directories and namespaces, then run `sync` and `check`.

### Requirement: Dry run performs no writes and installs nothing

**Reason**: `init --dry-run` existed to preview the rename. With no rename there is nothing to
preview.

**Migration**: `doctor` remains the read-only command for inspecting repository state, and its
no-write guarantee is retained under the `local-and-ci-checks` capability.

### Requirement: Initialization is distinct from reconfiguration

**Reason**: With `init` removed there is no initialization step to distinguish from
reconfiguration. The persisted `template.initialized` marker is removed from
`project.config.json`.

**Migration**: The half of this requirement that still applies — that regenerating derived context
is `sync`'s responsibility and that a configuration change does not rewrite application code — is
retained as "Derived context is regenerated without overwriting authored files" under the
`local-and-ci-checks` capability.

### Requirement: User-authored artifacts are never overwritten

**Reason**: The requirement was phrased over `init` and `sync` jointly. `init` no longer exists.

**Migration**: Retained in full for `sync` as "Derived context is regenerated without overwriting
authored files" under the `local-and-ci-checks` capability. No protection is lost: specs, changes
and ADRs remain files no tooling may overwrite.

### Requirement: Portable and safe invocation

**Reason**: This constrains `tools/repo.mjs` as a whole, not the retired `init` command, so it was
filed under the wrong capability once initialization was removed.

**Migration**: Retained verbatim as "Portable and safe invocation" under the `local-and-ci-checks`
capability, which owns the behaviour of the check entry point.

### Requirement: Read-only commands do not repair

**Reason**: This constrains `doctor`, which survives the retirement of the template capability.

**Migration**: Retained verbatim as "Read-only commands do not repair" under the
`local-and-ci-checks` capability.
