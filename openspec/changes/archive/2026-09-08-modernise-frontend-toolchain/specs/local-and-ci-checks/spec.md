## MODIFIED Requirements

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

## ADDED Requirements

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
