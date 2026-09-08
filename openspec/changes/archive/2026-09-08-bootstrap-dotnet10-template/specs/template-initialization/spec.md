## Purpose

Turns the template into a named, working application through one parameter mechanism shared by both
start paths, without blind repository-wide text replacement and without destroying work a user has
already done.

## ADDED Requirements

### Requirement: Two start paths over one set of sources

The template SHALL support starting from GitHub "Use this template" followed by local configuration,
and from `dotnet new` using `.template.config/template.json`. Both paths SHALL derive their
substitution tokens from a single declaration, `tools/rename.manifest.json`. The repository SHALL
NOT contain two independent copies of the application.

#### Scenario: Manifest and dotnet new template agree
- **WHEN** the consistency test compares `.template.config/template.json` with
  `tools/rename.manifest.json`
- **THEN** the test passes only if the `sourceName` and every declared symbol match the manifest's
  token set exactly

#### Scenario: Drift between the two paths fails the check
- **WHEN** a token is added to the manifest but not to `template.json`
- **THEN** the consistency test fails and names the missing symbol

### Requirement: Targeted renaming

`init` SHALL apply substitutions only to the file set declared in the manifest, and SHALL rename
directories, project files, file names, namespaces, the solution file and the agent context
accordingly. It SHALL NOT perform an unscoped repository-wide search and replace.

#### Scenario: Declared files are rewritten
- **WHEN** `init` runs with a new solution name and root namespace
- **THEN** the source projects, test projects, solution file, namespaces and the generated agent
  context use the new names, and no file outside the manifest's declared set is modified

#### Scenario: No leftover template identity
- **WHEN** a generated application is searched for the template's placeholder token
- **THEN** no occurrence is found outside `tools/` and `.template.config/`, and no unresolved
  placeholder remains

### Requirement: Dry run performs no writes and installs nothing

`init --dry-run` SHALL print the planned file creations, modifications, renames and conflicts, and
SHALL NOT write to the working tree, and SHALL NOT install dependencies.

#### Scenario: Dry run leaves the tree untouched
- **WHEN** `init --config <file> --dry-run` runs in a clean checkout
- **THEN** the command prints a change report, and `git status --porcelain` produces no output

### Requirement: Initialization is distinct from reconfiguration

`init` SHALL apply only to a repository that has not been initialized, recorded by a persisted
marker in `project.config.json`. Re-running `init` on an initialized repository SHALL report that
state and make no changes. Changing configuration afterwards SHALL NOT rewrite application code;
regenerating derived context SHALL require the separate `sync` command.

#### Scenario: Re-running init produces no diff
- **WHEN** `init` runs a second time on an already initialized repository
- **THEN** the command reports the repository as already initialized, exits with a non-zero code,
  and `git status --porcelain` produces no output

#### Scenario: Renaming after initialization is refused
- **WHEN** the solution name is changed in the configuration of an initialized repository and
  `init` is run
- **THEN** the command refuses, explains that renaming an existing application is a manual
  operation, and does not modify any source file

#### Scenario: Sync regenerates derived context only
- **WHEN** a non-identity value such as the module registry changes and `sync` runs
- **THEN** only files marked as generated are updated, and specifications, ADRs and other
  user-authored files are left unchanged

### Requirement: User-authored artifacts are never overwritten

`init` and `sync` SHALL NOT overwrite files under `openspec/specs/`, `openspec/changes/`,
`docs/adr/`, or any file not declared as generated. On conflict they SHALL report the conflict and
stop rather than overwrite.

#### Scenario: Existing specification survives
- **WHEN** `sync` runs in a repository containing an authored specification
- **THEN** the specification is byte-identical afterwards

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
