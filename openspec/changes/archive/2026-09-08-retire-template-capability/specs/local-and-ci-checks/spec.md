## ADDED Requirements

### Requirement: Portable and safe invocation

`repo.mjs` SHALL run on Windows, Linux and macOS without requiring WSL, SHALL work when the
repository path contains spaces, and SHALL work when invoked from a subdirectory. It SHALL pass
arguments to child processes as argument vectors without a shell, and SHALL NOT use `eval` or any
dynamic code evaluation.

#### Scenario: Path with spaces
- **WHEN** the repository is located at a path containing a space and `check` runs
- **THEN** every stage resolves its paths correctly and the exit code reflects the real result

#### Scenario: Invocation from a subdirectory
- **WHEN** `node ../../tools/repo.mjs doctor` runs from a nested source directory
- **THEN** the command locates the repository root and behaves as if run from the root

#### Scenario: Argument injection is not possible
- **WHEN** a configuration value contains shell metacharacters
- **THEN** the value is passed to child processes as a single argument and is never interpreted by
  a shell

### Requirement: Read-only commands do not repair

`doctor` SHALL report problems without modifying the working tree.

#### Scenario: Doctor never writes
- **WHEN** `doctor` runs in a repository with a detectable drift between configuration and
  generated files
- **THEN** the drift is reported, and `git status --porcelain` produces no output

### Requirement: Derived context is regenerated without overwriting authored files

Regenerating derived context SHALL be the `sync` command's sole responsibility, and `sync` SHALL
update only the regions and files declared as generated. `sync` SHALL NOT overwrite files under
`openspec/specs/`, `openspec/changes/`, `docs/adr/`, or any file not declared as generated. On
conflict it SHALL report the conflict and stop rather than overwrite. A configuration change SHALL
NOT rewrite application code.

#### Scenario: Existing specification survives
- **WHEN** `sync` runs in a repository containing an authored specification
- **THEN** the specification is byte-identical afterwards

#### Scenario: Sync regenerates derived context only
- **WHEN** a non-identity configuration value changes and `sync` runs
- **THEN** only files marked as generated are updated, and specifications, ADRs and other
  user-authored files are left unchanged

#### Scenario: Drift between a generated region and its source fails the check
- **WHEN** a generated region no longer matches the source it is rendered from
- **THEN** the configuration stage fails and names the region and its source file
