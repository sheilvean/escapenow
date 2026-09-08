## Purpose

Keeps human review ahead of the code and makes closing a change a verifiable state rather than a
claim in a pull-request description.

## ADDED Requirements

### Requirement: The standard change flow

The documented default flow SHALL be: understand the problem and the existing code; create the
proposal, specification and design; wait for human review; implement; run the local checks; run the
standard `/opsx:verify`; wait for code review; run `/opsx:archive` keeping the current
specifications; pass the archive gate and the remaining required CI checks; merge and deploy where
configured.

#### Scenario: A change is Standard by default
- **WHEN** a change's class is not explicitly established
- **THEN** the documentation and the agent context treat it as Standard

#### Scenario: Diff size does not establish Trivial
- **WHEN** a change is small but alters behaviour, a contract, permissions or architecture
- **THEN** it SHALL NOT be classified as Trivial

#### Scenario: A dependency change is not automatically Trivial
- **WHEN** a change adds, removes or upgrades a dependency
- **THEN** it SHALL NOT be classified as Trivial on that basis alone

### Requirement: The Trivial class is bounded

A Trivial change SHALL be limited to a small change with no effect on behaviour, contracts,
permissions or architecture. It SHALL still require tests, review and CI, but SHALL NOT require the
full OpenSpec artifact flow. A label or a sentence in a pull request SHALL NOT by itself exempt a
change from the policy.

#### Scenario: A claim of triviality does not bypass CI
- **WHEN** a pull request declares itself Trivial
- **THEN** every required CI check still runs and must pass

### Requirement: The archive gate uses CLI data

The archive gate SHALL determine the set of active changes from `openspec list --json` produced by
the pinned local CLI, or from the documented directory structure of that pinned version. By default
it SHALL require zero active changes before the final merge. The archive directory SHALL NOT count
as an active change.

#### Scenario: An active change blocks finalization
- **WHEN** the gate runs with one active change present
- **THEN** the gate fails and names the active change

#### Scenario: A correctly archived change passes
- **WHEN** the change has been archived and the current specifications reflect it
- **THEN** the gate passes

#### Scenario: The archive directory is not an active change
- **WHEN** `openspec/changes/archive/` contains archived changes and no active change exists
- **THEN** the gate passes

### Requirement: A read failure is not an absence of changes

If the gate cannot read the CLI output, parse it, or locate the OpenSpec root, it SHALL fail with a
diagnostic. It SHALL NOT interpret the failure as zero active changes.

#### Scenario: Broken CLI output fails the gate
- **WHEN** the CLI exits non-zero or emits unparseable output
- **THEN** the gate exits with a non-zero code and reports a read error distinct from a policy
  violation

#### Scenario: Corrupted configuration fails the gate
- **WHEN** `openspec/config.yaml` is unreadable or malformed
- **THEN** the gate exits with a non-zero code and reports the error

### Requirement: Deleting a directory is not proof of archiving

The gate SHALL verify that a closed change is linked to an entry under the archive and reflected in
the current specifications, wherever that link can be established deterministically. Removing a
change directory without a corresponding archive entry SHALL NOT satisfy the gate.

#### Scenario: A deleted change without an archive entry fails
- **WHEN** an active change directory is deleted and no matching archive entry exists in the commit
  range under review
- **THEN** the gate fails and reports the missing archive entry

### Requirement: Drafts run fast checks but cannot pass the closing gate

The policy SHALL allow a draft pull request to run the fast checks while a change is still active,
and SHALL prevent it from passing the final closing gate. The full merge path SHALL enforce the
archive gate before the remaining required stages.

#### Scenario: A draft with an active change still runs tests
- **WHEN** a draft pull request contains an active change
- **THEN** the fast check jobs execute and report their real results

#### Scenario: A draft with an active change cannot satisfy the gate
- **WHEN** the archive gate evaluates a pull request with an active change
- **THEN** the gate reports a failure regardless of the pull request's draft state

### Requirement: Policy scope is configured, not inferred from branch names

The gate's scope SHALL be configured in `project.config.json` and the pull-request or branch context
SHALL be detected from the CI event payload. The policy SHALL NOT depend on a hardcoded branch name
such as `main` or a pattern such as `feature/*`.

#### Scenario: A renamed default branch still works
- **WHEN** the repository's default branch has a name other than `main`
- **THEN** the gate and the workflows operate unchanged

### Requirement: Per-pull-request scope is an explicit extension

The template SHALL document an optional scope limited to the changes touched by the current pull
request, and SHALL state that it is weaker than the default repository-wide requirement of zero
active changes. It SHALL NOT be presented as equivalent to the default.

#### Scenario: The weaker scope is labelled
- **WHEN** a reader consults the archive gate documentation
- **THEN** the per-pull-request scope is described as an extension with its stated limitation
