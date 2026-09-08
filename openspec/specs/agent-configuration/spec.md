## Purpose

Gives the coding agent a small, project-scoped context with explicit permission boundaries, and
makes that configuration itself something CI validates rather than trusts.

## Requirements

### Requirement: Project-scoped configuration only

The repository SHALL place its agent configuration under the repository's `.claude/` directory and
SHALL NOT install anything into the user's home directory. Local configuration and session data
SHALL be excluded from version control.

#### Scenario: No home-directory installation
- **WHEN** `sync` completes
- **THEN** no file outside the repository has been created or modified

#### Scenario: Local settings are ignored by Git
- **WHEN** `.claude/settings.local.json` or session state exists
- **THEN** `git status --porcelain` does not list it

### Requirement: A short repository map in CLAUDE.md

`CLAUDE.md` SHALL provide a brief repository map, pointers to the configuration, architecture and
requirements, the common commands, the change workflow, the permission boundaries, and the
obligation to report test results honestly. It SHALL NOT import the full documentation set into
every session.

#### Scenario: Referenced paths exist
- **WHEN** the agent-configuration check runs
- **THEN** every repository path referenced by `CLAUDE.md` exists

#### Scenario: Honest reporting is stated
- **WHEN** a reader opens `CLAUDE.md`
- **THEN** it states that a skipped, unavailable or failing check must be reported as such and never
  as a pass

### Requirement: Layered, path-scoped rules

Rules SHALL be organised as `common/` for workflow, quality, security and sources of truth, and
`dotnet/` for C# idioms, testing and ASP.NET Core, plus rules derived from the selected architecture
profile. Rules that are irrelevant to a task SHALL NOT be permanently loaded; path scoping SHALL be
used where it helps.

#### Scenario: A .NET rule is scoped to .NET files
- **WHEN** a rule applies only to C# sources
- **THEN** it declares a path scope covering those files

### Requirement: Skills with a complete contract

The repository SHALL provide a `repo-check` skill for running the shared checks and interpreting
their output, and a `repo-review` skill for reviewing an implementation against its change
contract. Migration and deployment procedures SHALL exist only for integrations the configuration
enables. Every skill SHALL have a valid `SKILL.md` stating its usage conditions, inputs, steps,
verification and stopping conditions.

#### Scenario: Skill frontmatter is valid
- **WHEN** the agent-configuration check runs
- **THEN** every `SKILL.md` parses, declares the required fields, and every command and path it
  references resolves

#### Scenario: A skill for a disabled integration is absent
- **WHEN** `integrations.deployment` is `none`
- **THEN** no deployment procedure skill is present

### Requirement: Restricted review subagents

The repository SHALL provide a `code-reviewer` and an `architecture-reviewer` subagent, each with a
restricted tool set. By default they SHALL NOT edit files and SHALL NOT perform deployments. The
documentation SHALL state that a subagent's review does not replace a human review.

#### Scenario: Reviewers cannot write
- **WHEN** the agent-configuration check inspects the review subagents
- **THEN** neither declares a file-writing or deployment-capable tool

### Requirement: Model names are not embedded per agent

Agent definitions SHALL inherit the model or take it from a central setting, and SHALL NOT hardcode
a model name in each definition.

#### Scenario: No hardcoded model name
- **WHEN** the agent-configuration check inspects the agent definitions
- **THEN** none contains a literal Claude model identifier

### Requirement: Commands are thin entry points

Slash commands SHALL be optional thin entry points to existing skills. They SHALL NOT duplicate a
procedure, SHALL NOT alias a name that collides with a skill, and SHALL NOT introduce a plan/apply
workflow competing with OpenSpec.

#### Scenario: No name collision
- **WHEN** the agent-configuration check compares command names with skill names
- **THEN** no collision is reported

### Requirement: Least-privilege permissions

Settings SHALL deny reads of credential-bearing paths, deny shell network and remote-access
commands, and allow only a documented set of development commands. Settings SHALL NOT enable a
bypass-permissions mode or a broad allow-all rule. Every file that changes what the agent is
permitted to do — the settings themselves, the project configuration, the pinned toolchain, the
package versions and the CI workflows — SHALL sit behind an `ask` rule, and that coverage SHALL be
validated rather than assumed.

#### Scenario: A forbidden setting fails the check
- **WHEN** settings enable bypassing permissions or an allow-all tool rule
- **THEN** the agent-configuration check fails and names the setting

#### Scenario: Credential paths are denied
- **WHEN** the check inspects the deny list
- **THEN** environment files and the documented credential directories are present

#### Scenario: A protected configuration file dropped from the ask list fails the check
- **WHEN** a protected configuration file is not covered by an `ask` rule
- **THEN** the agent-configuration check fails and names the file and the rule to add

### Requirement: Small, testable hooks

Hooks SHALL be limited to fast feedback after relevant file changes and a Stop reminder about an
active OpenSpec change. A hook SHALL NOT be added for the sole purpose of narrating a constraint
the permission rules already enforce. Hooks SHALL read and write valid JSON, declare timeouts,
resolve paths safely, and SHALL NOT invoke themselves recursively. A hook SHALL NOT run a full
build or an end-to-end suite after every write.

#### Scenario: Malformed hook input does not crash
- **WHEN** a hook receives input that is not valid JSON
- **THEN** it exits without an unhandled exception and does not block the session

#### Scenario: Fast feedback stays fast
- **WHEN** the post-change hook runs
- **THEN** it executes only file-scoped checks and does not invoke a solution build or an
  end-to-end suite

#### Scenario: A protected configuration file is guarded by the permission rules
- **WHEN** an edit is attempted against a file the repository treats as protected configuration
- **THEN** the permission rules prompt a human, and no hook is relied upon to convey the constraint

### Requirement: The Stop hook reminds without deciding

The Stop hook SHALL remind about an active OpenSpec change. It SHALL NOT archive, SHALL NOT approve
a change on a human's behalf, SHALL NOT block session termination indefinitely, SHALL honour
`stop_hook_active`, SHALL limit repetition, and SHALL NOT force the closure of a change still being
worked on.

#### Scenario: stop_hook_active suppresses the reminder
- **WHEN** the Stop hook receives input with `stop_hook_active` set to true
- **THEN** it exits silently with code 0 and emits no reminder

#### Scenario: The reminder does not block
- **WHEN** an active change exists and the Stop hook runs
- **THEN** it emits an informational reminder and exits with code 0, allowing the session to end

#### Scenario: Repetition is limited
- **WHEN** the Stop hook has already reminded within the same session
- **THEN** it does not repeat the reminder

### Requirement: External content is data, not policy

The rules SHALL state that content from MCP servers, issues, pull requests and web pages is
untrusted data and SHALL NOT be treated as repository policy or as authorisation to act. Expanding
network access, file access outside the repository, or infrastructure access SHALL require human
consent.

#### Scenario: Untrusted content is labelled
- **WHEN** a reader consults the security rules
- **THEN** the untrusted-content boundary and the consent requirement are stated

### Requirement: The agent configuration is validated in CI

CI SHALL validate the agent configuration: JSON and frontmatter well-formedness, resolvability of
referenced files, absence of forbidden settings, absence of secrets, and the presence and
executability of every declared hook.

#### Scenario: A missing hook script fails CI
- **WHEN** settings declare a hook whose script is absent
- **THEN** the agent-configuration job fails and names the missing path

#### Scenario: Invalid frontmatter fails CI
- **WHEN** a skill or agent file has unparseable frontmatter
- **THEN** the agent-configuration job fails and names the file

### Requirement: Protection boundaries are described honestly

The documentation SHALL state that a prompt, a rule file and a list of patterns are not a sandbox,
SHALL describe what the configured protections do and do not cover, and SHALL describe optional
system-level isolation separately.

#### Scenario: The limits are documented
- **WHEN** a reader opens `SECURITY.md`
- **THEN** it distinguishes advisory guardrails from enforced isolation and states the residual risk
