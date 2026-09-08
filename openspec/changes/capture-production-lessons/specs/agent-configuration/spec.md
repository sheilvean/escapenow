## ADDED Requirements

### Requirement: Observed failure modes are recorded where they are read

The rules and skills SHALL record failure modes actually observed in this repository, each stating
the symptom, the cause and the remedy. A recorded failure mode SHALL describe something that has
happened, not a hypothetical risk, so that the record stays short enough to be read. Guidance that
tells the agent what to do SHALL be paired with the failure it prevents wherever that failure has
been observed.

#### Scenario: A skill records what its own failures look like
- **WHEN** a maintainer reads the check or review skill
- **THEN** it states, for each recorded failure, the symptom that appears, the cause, and the
  remedy, and does not present an unobserved risk as an observed one

#### Scenario: A recorded remedy points at the mechanism that enforces it
- **WHEN** a recorded failure mode is one the repository now detects automatically
- **THEN** the record names the check, rule or test that detects it, so a reader can tell guidance
  from enforcement

## MODIFIED Requirements

### Requirement: Small, testable hooks

Hooks SHALL be limited to fast feedback after relevant file changes, a Stop reminder about an active
OpenSpec change, an optional warning when a protected configuration file changes, and a guard that
refuses hand edits to files a generator owns. Hooks SHALL read and write valid JSON, declare
timeouts, resolve paths safely, and SHALL NOT invoke themselves recursively. A hook SHALL NOT run a
full build or an end-to-end suite after every write.

A guard hook SHALL fail open: when its input cannot be parsed it SHALL permit the operation rather
than block it, because a hook that wedges legitimate edits on malformed input is worse than no hook.
A blocking hook SHALL name the supported way to achieve the intent it refused, not only the refusal.
The documentation SHALL continue to state that hooks are advisory and are not a sandbox.

#### Scenario: Malformed hook input does not crash
- **WHEN** a hook receives input that is not valid JSON
- **THEN** it exits without an unhandled exception and does not block the session

#### Scenario: Fast feedback stays fast
- **WHEN** the post-change hook runs
- **THEN** it executes only file-scoped checks and does not invoke a solution build or an
  end-to-end suite

#### Scenario: A hand edit to a generator-owned file is refused with a remedy
- **WHEN** an edit or write targets a path owned by the OpenSpec CLI
- **THEN** the operation is blocked and the message names the command that regenerates the file

#### Scenario: An ordinary path is unaffected by the guard
- **WHEN** an edit or write targets a path no generator owns
- **THEN** the guard permits it

#### Scenario: A path form does not defeat the guard
- **WHEN** a generator-owned path is expressed as an absolute path, as a repository-relative path,
  or with the platform's alternate directory separator
- **THEN** the guard recognises it in every one of those forms

### Requirement: Skills with a complete contract

The template SHALL provide a `repo-check` skill for running the shared checks and interpreting their
output, and a `repo-review` skill for reviewing an implementation against its change contract.
Migration and deployment procedures SHALL exist only for integrations the configuration enables.
Every skill SHALL have a valid `SKILL.md` stating its usage conditions, inputs, steps, verification
and stopping conditions.

The agent-configuration check SHALL additionally verify mechanically that each skill's declared name
matches the directory that contains it, that its description falls within a stated length range,
that every asset path its body references exists, and that its body does not exceed a stated length.
Each SHALL be reported as a failure naming the skill and the offending value. Each of these defects
otherwise produces a skill that fails to load, never matches a request, or points at a file that is
absent, and none of them is visible at the point the skill is written.

#### Scenario: Skill frontmatter is valid
- **WHEN** the agent-configuration check runs
- **THEN** every `SKILL.md` parses, declares the required fields, and every command and path it
  references resolves

#### Scenario: A name that disagrees with its directory fails
- **WHEN** a skill declares a name that is not the name of its own directory
- **THEN** the agent-configuration check fails and names both values

#### Scenario: A description outside the permitted length fails
- **WHEN** a skill description is shorter or longer than the permitted range
- **THEN** the agent-configuration check fails, names the skill, and reports the actual length

#### Scenario: A referenced asset that does not exist fails
- **WHEN** a skill body references an asset path that is not present on disk
- **THEN** the agent-configuration check fails and names the missing path

#### Scenario: A skill for a disabled integration is absent
- **WHEN** `integrations.deployment` is `none`
- **THEN** no deployment procedure skill is present
