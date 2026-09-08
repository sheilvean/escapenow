## Purpose

Gives a generated repository one validated place to declare its own identity, layout, architecture
profile and enabled integrations, so reusable instructions can read configuration instead of
repeating an application's name.

## ADDED Requirements

### Requirement: Validated project configuration

The template SHALL provide `project.config.json` and a JSON Schema that validates it. The
configuration SHALL declare the solution name, the root namespace, the solution/source/test paths,
the selected architecture profile, the module registry, the documentation language, the optional
integrations, and the OpenSpec change and archive policy.

#### Scenario: Valid configuration is accepted
- **WHEN** `node tools/repo.mjs doctor` runs against a configuration that satisfies the schema
- **THEN** the command reports the configuration as valid and exits with code 0

#### Scenario: Unknown key is rejected
- **WHEN** the configuration contains a property the schema does not define
- **THEN** `doctor` reports the offending JSON pointer and exits with a non-zero code

#### Scenario: Invalid identifier is rejected
- **WHEN** `rootNamespace` is not a sequence of dot-separated C# identifiers
- **THEN** `doctor` reports the offending value and exits with a non-zero code

#### Scenario: Malformed JSON is a failure, not an empty configuration
- **WHEN** `project.config.json` cannot be parsed
- **THEN** `doctor` reports a parse error and exits with a non-zero code, and SHALL NOT fall back
  to default values

### Requirement: Single source of truth per concern

The configuration SHALL NOT duplicate values owned by another file. The .NET SDK version SHALL be
owned by `global.json`, NuGet package versions by `Directory.Packages.props`, the OpenSpec CLI
version by `package.json` and its lockfile, product requirements by OpenSpec artifacts, and
architecture rationale by ADRs under `docs/adr/`.

#### Scenario: Documented sources of truth
- **WHEN** a reader opens `docs/sources-of-truth.md`
- **THEN** every concern above is listed with its owning file and marked as authoritative or
  generated

#### Scenario: Duplication is detected
- **WHEN** a check runs and `project.config.json` declares an SDK version or a NuGet package version
- **THEN** the configuration check fails and names the file that owns that value

### Requirement: No hardcoded application identity in reusable instructions

Reusable instructions — `CLAUDE.md`, files under `.claude/rules/`, `.claude/skills/`, and
`tools/` — SHALL NOT contain example domain module names as mandatory modules, private paths,
company addresses, account identifiers, a hardcoded default branch name, an imposed cloud provider,
database, container registry, or Claude model name.

#### Scenario: Forbidden literal is detected
- **WHEN** the agent-configuration check runs and a reusable instruction file contains a forbidden
  literal from the documented deny list
- **THEN** the check fails and reports the file, the line and the matched pattern

#### Scenario: Explicit template parameters are allowed
- **WHEN** a reusable instruction refers to a configuration value through its documented parameter
  name or reads it from `project.config.json`
- **THEN** the check passes

#### Scenario: Test fixtures may use names
- **WHEN** a file under `tests/fixtures/` or `tools/tests/` contains an example module or solution name
- **THEN** the check passes, because fixtures are excluded from the deny list by documented rule
