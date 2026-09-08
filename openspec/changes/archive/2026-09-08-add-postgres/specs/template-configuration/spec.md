## MODIFIED Requirements

### Requirement: Validated project configuration

The repository SHALL provide `project.config.json` and a JSON Schema that validates it. The
configuration SHALL declare the solution name, the root namespace, the solution/source/test paths,
the selected architecture profile, the documentation language, the optional integrations, and the
OpenSpec change and archive policy. It MAY declare the path of a browser application; when it does,
that path SHALL be a repository-relative forward-slash path, and when it does not, checks that
depend on a browser application SHALL report themselves as not configured rather than as passed.
`integrations.database` SHALL be `none` or `postgres`. It SHALL NOT declare a module registry, and
it SHALL NOT record template initialization state.

#### Scenario: Valid configuration is accepted
- **WHEN** `node tools/repo.mjs doctor` runs against a configuration that satisfies the schema
- **THEN** the command reports the configuration as valid and exits with code 0

#### Scenario: Unknown key is rejected
- **WHEN** the configuration contains a property the schema does not define
- **THEN** `doctor` reports the offending JSON pointer and exits with a non-zero code

#### Scenario: Invalid identifier is rejected
- **WHEN** `rootNamespace` is not a sequence of dot-separated C# identifiers
- **THEN** `doctor` reports the offending value and exits with a non-zero code

#### Scenario: A frontend path is optional but validated
- **WHEN** the configuration declares a frontend path that is absolute, contains a backslash, or
  traverses out of the repository
- **THEN** `doctor` reports the offending value and exits with a non-zero code

#### Scenario: A configuration with no frontend is valid
- **WHEN** the configuration declares no frontend path
- **THEN** `doctor` reports the configuration as valid and exits with code 0

#### Scenario: postgres is an accepted persistence integration
- **WHEN** `integrations.database` is `postgres` and the rest of the configuration satisfies the
  schema
- **THEN** `doctor` reports the configuration as valid and exits with code 0

#### Scenario: An unknown persistence integration is rejected
- **WHEN** `integrations.database` is a value other than `none` or `postgres`
- **THEN** `doctor` reports the offending value and exits with a non-zero code

#### Scenario: Malformed JSON is a failure, not an empty configuration
- **WHEN** `project.config.json` cannot be parsed
- **THEN** `doctor` reports a parse error and exits with a non-zero code, and SHALL NOT fall back
  to default values
