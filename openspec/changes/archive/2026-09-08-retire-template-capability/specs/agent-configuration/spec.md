## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: MCP is present but inactive by default

**Reason**: MCP was configured off and `.mcp.json` declared no servers. The file existed only
because the required-file list and the agent-configuration check demanded it, so it documented a
capability the repository did not have. `.mcp.json`, `integrations.mcp` and the `checkMcp`
sub-check are removed together.

**Migration**: Enabling MCP in future means adding `.mcp.json` and reinstating a validation
sub-check for it in the same change. The permission rule that forbids automatically trusting all
project MCP servers is retained under "Least-privilege permissions", so re-enabling MCP does not
reopen that hole.
