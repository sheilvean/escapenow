## Purpose

Gives contributors and CI one command whose result means the same thing in both places, so a green
local run is evidence rather than a guess.

## Requirements

### Requirement: One check entry point with declared stages

`node tools/repo.mjs check` SHALL run, in order: configuration and generated-file validation,
formatting verification, build with analyzers, unit tests, architecture tests, fast integration
tests, the browser application's production build, the browser application's unit tests, OpenSpec
artifact validation, agent-configuration validation, continuous-integration workflow validation,
and the repository tooling tests. Each stage SHALL report its command, its outcome and its
duration.

#### Scenario: Workflow validation is part of the run
- **WHEN** `check` runs in a repository containing `.github/workflows/`
- **THEN** the workflows are linted and the safety properties the documentation states about them
  are verified, as a stage of the same run

#### Scenario: A repository with no workflows reports the stage as not configured
- **WHEN** `.github/workflows/` does not exist
- **THEN** the workflow stage is reported as "not configured", and SHALL NOT be reported as passed

#### Scenario: The browser application is part of the run
- **WHEN** `check` runs in a repository whose configuration declares a frontend path
- **THEN** that application is built and its tests are executed as stages of the same run, and
  their outcomes appear in the same summary as the .NET stages

#### Scenario: A failing stage fails the run
- **WHEN** any stage exits with a non-zero code
- **THEN** `check` exits with a non-zero code and the summary marks that stage as failed

#### Scenario: The report names the exact command
- **WHEN** `check` completes
- **THEN** the summary lists, for every stage, the exact command line that was executed

### Requirement: The browser application is verified by the same entry point

The browser application SHALL be built with its production configuration and SHALL have its unit
tests executed by `node tools/repo.mjs check`, under the same reporting rules as every other
stage. The test stage SHALL fail when the test run reports zero executed tests, and the build
stage SHALL fail when the production build emits an error. Neither stage SHALL be reported as
passed on the strength of an exit code alone.

The unit-test run SHALL terminate without human intervention and SHALL NOT require a browser to be
launched, installed or kept open. It SHALL NOT depend on network access beyond the dependencies
already installed from the frontend lockfile.

#### Scenario: A broken frontend test fails the run
- **WHEN** a frontend unit test asserts something the component does not do, and `check` runs
- **THEN** the frontend test stage is reported as failed and `check` exits with a non-zero code

#### Scenario: A frontend build error fails the run
- **WHEN** the frontend production build reports a compilation or template type error
- **THEN** the frontend build stage is reported as failed and `check` exits with a non-zero code

#### Scenario: Zero executed frontend tests is not evidence
- **WHEN** the frontend test command exits successfully but reports that no test was executed
- **THEN** the frontend test stage is reported as failed, with a message saying an empty run is
  not evidence

#### Scenario: An unreadable test result is not a pass
- **WHEN** the frontend test command produces no result the pipeline can read
- **THEN** the stage is reported as failed, because an unknown outcome is not a good one

#### Scenario: The run needs no browser and no human
- **WHEN** the frontend test stage runs on a machine with no interactive session and no installed
  browser
- **THEN** the tests execute, terminate on their own, and the stage reports a result

### Requirement: Missing frontend dependencies are a failure, not a skip

When the configuration declares a frontend path but the directory is absent or its dependencies
are not installed, the frontend stages SHALL be reported as failed, naming the command that
installs them from the frontend lockfile. They SHALL NOT be reported as "not configured" and SHALL
NOT be silently skipped. CI SHALL install those dependencies from the lockfile, so that a lockfile
which disagrees with its manifest fails the run.

#### Scenario: An uninstalled frontend fails the check
- **WHEN** the configuration declares a frontend path, its dependencies are not installed, and
  `check` runs
- **THEN** the frontend stages fail and the message names the install command

#### Scenario: CI installs from the lockfile
- **WHEN** the pull-request checks job prepares the repository
- **THEN** it installs the frontend's dependencies from the frontend lockfile, and a manifest that
  disagrees with that lockfile fails the job

#### Scenario: A deleted frontend cannot turn the stages green
- **WHEN** the configuration declares a frontend path and that directory does not exist
- **THEN** the frontend stages are reported as failed, because a declared part of the repository
  that has gone missing is not a disabled integration

#### Scenario: A repository with no frontend reports the stages as not configured
- **WHEN** the configuration declares no frontend path
- **THEN** the frontend stages are reported as "not configured", and SHALL NOT be reported as
  passed

### Requirement: Validation never modifies the working tree

`check` SHALL verify formatting without rewriting files, and SHALL NOT modify source code. Applying
formatting SHALL be a separate command.

#### Scenario: Formatting is verified, not applied
- **WHEN** `check` runs in a repository containing a formatting violation
- **THEN** the formatting stage fails, and the offending file is byte-identical afterwards

#### Scenario: The fix command is separate
- **WHEN** `node tools/repo.mjs format --write` runs
- **THEN** formatting is applied, and this command is not part of `check`

### Requirement: A single implementation of the rules, shared with CI

CI SHALL invoke the same entry point rather than reimplementing the stages. `check --ci` SHALL add
machine-readable output and the checks that only apply to a pull request.

#### Scenario: CI runs the shared entry point
- **WHEN** the pull-request workflow executes its checks job
- **THEN** the job invokes `node tools/repo.mjs check --ci` and does not duplicate any stage's logic

### Requirement: A disabled stage is reported as not configured

A stage that depends on an integration the configuration does not enable SHALL be reported as "not
configured". It SHALL NOT be reported as passed, and SHALL NOT contribute a successful result.

#### Scenario: Disabled persistence is not a pass
- **WHEN** `integrations.database` is `none` and `check` runs
- **THEN** the database stage is reported as "not configured", and the summary distinguishes it
  from passed stages

#### Scenario: A removed required check cannot yield green
- **WHEN** a required stage or its configuration file is deleted
- **THEN** `check` fails and reports the missing stage, rather than skipping it silently

### Requirement: No paid or credentialed dependency in build, test or check

Building, testing and checking the repository SHALL NOT require a model API key, a Claude account,
or any paid or per-seat-licensed service. Every tool the checks invoke SHALL be free to use in every
configuration. CI SHALL NOT run an AI agent by default.

#### Scenario: Checks run without any credential
- **WHEN** `check` runs in an environment with no API keys and no logged-in accounts
- **THEN** every configured stage executes and the run completes

#### Scenario: A licence-gated tool is rejected
- **WHEN** a dependency or CI action requires a licence key or a paid tier in any configuration
- **THEN** it SHALL NOT be used, and the documentation SHALL record the free alternative chosen

### Requirement: Dependency and secret scanning

CI SHALL scan .NET and Node dependencies for known vulnerabilities and scan the repository for
secrets, using tools pinned by version and verified by checksum where they are downloaded. Every
Node dependency tree the repository installs SHALL be scanned, not only the one at the repository
root.

#### Scenario: A vulnerable package fails CI
- **WHEN** a referenced package has a known vulnerability at or above the configured severity
- **THEN** the dependency scan job fails and names the package

#### Scenario: The browser application's dependencies are scanned too
- **WHEN** the dependency scan job runs in a repository that declares a frontend path with its own
  lockfile
- **THEN** that lockfile's dependency tree is audited as well as the repository root's

#### Scenario: A committed secret fails CI
- **WHEN** a file matching a secret pattern is committed
- **THEN** the secret scan job fails and reports the location without printing the secret value

#### Scenario: A tampered scanner download fails closed
- **WHEN** a downloaded scanner binary does not match its recorded checksum
- **THEN** the job fails and does not execute the binary

### Requirement: Pull-request workflow safety

Workflows SHALL declare least-privilege `permissions`, SHALL pin every action to a commit SHA,
SHALL NOT expose secrets to code from forks, and SHALL NOT execute pull-request code from a
privileged `pull_request_target` context. Required check names SHALL be stable, and the workflow
SHALL handle `ready_for_review`, pull-request updates, and merge queue events. An aggregate status
SHALL NOT report success when a required job was skipped or cancelled.

#### Scenario: A skipped required job is not green
- **WHEN** a required job is skipped or cancelled and the aggregate status job evaluates the run
- **THEN** the aggregate job fails, because it asserts each required job's result explicitly

#### Scenario: A fork pull request receives no secrets
- **WHEN** the workflow runs for a pull request from a fork
- **THEN** no job referencing a repository secret executes

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
