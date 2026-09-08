## ADDED Requirements

### Requirement: Every pinned package version is used

The check SHALL verify that every centrally pinned package version is referenced by at least one
project or build-convention file, and SHALL fail naming any pin that nothing references. Such a pin
advertises a capability the repository does not have: it survives review because it looks like
configuration, and it is discovered only when someone relies on it.

The scan SHALL consider build-convention files as well as project files, because a dependency
injected into every project — an analyzer, for instance — is referenced from a convention file and
would otherwise be reported as unused.

#### Scenario: An unreferenced pin fails the check
- **WHEN** a package version is pinned centrally and no project or convention file references it
- **THEN** the check fails and names the pinned package

#### Scenario: A dependency injected from a convention file counts as referenced
- **WHEN** a pinned package is referenced only from a build-convention file that applies to every
  project
- **THEN** the check treats it as referenced and does not fail

## MODIFIED Requirements

### Requirement: Dependency and secret scanning

CI SHALL scan .NET and Node dependencies for known vulnerabilities and scan the repository for
secrets, using tools pinned by version and verified by checksum where they are downloaded. The
repository SHALL additionally declare automated dependency update proposals for every ecosystem
whose manifests it commits, so that a vulnerability the scan reports is also proposed for repair
rather than only detected. An update proposal SHALL arrive as a reviewable change and SHALL NOT be
applied without review.

#### Scenario: A vulnerable package fails CI
- **WHEN** a referenced package has a known vulnerability at or above the configured severity
- **THEN** the dependency scan job fails and names the package

#### Scenario: A committed secret fails CI
- **WHEN** a file matching a secret pattern is committed
- **THEN** the secret scan job fails and reports the location without printing the secret value

#### Scenario: A tampered scanner download fails closed
- **WHEN** a downloaded scanner binary does not match its recorded checksum
- **THEN** the job fails and does not execute the binary

#### Scenario: Every committed dependency ecosystem is covered by update proposals
- **WHEN** the repository commits a dependency manifest for an ecosystem
- **THEN** that ecosystem is covered by the automated dependency update configuration
