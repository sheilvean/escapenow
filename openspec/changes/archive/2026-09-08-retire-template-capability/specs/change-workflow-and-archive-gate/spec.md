## MODIFIED Requirements

### Requirement: Per-pull-request scope is an explicit extension

The repository SHALL document an optional scope limited to the changes touched by the current pull
request, and SHALL state that it is weaker than the default repository-wide requirement of zero
active changes. It SHALL NOT be presented as equivalent to the default.

#### Scenario: The weaker scope is labelled
- **WHEN** a reader consults the archive gate documentation
- **THEN** the per-pull-request scope is described as an extension with its stated limitation
