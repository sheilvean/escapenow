## Purpose

Makes the chosen architecture profile an executable rule set rather than a description, so a
violation fails a test instead of surviving until review.

## Requirements

### Requirement: Default layered profile with a declared dependency direction

The repository SHALL ship one default architecture profile named `layered`, in which `Domain`
depends on no other project of the solution, `Application` depends only on `Domain`,
`Infrastructure` depends on `Application` and `Domain` and implements their ports, and the host
composes the application and registers dependencies. Business logic SHALL NOT reside in HTTP
endpoints or in the composition root.

#### Scenario: Allowed direction passes
- **WHEN** the architecture tests run against the repository's own solution
- **THEN** every layer rule passes

#### Scenario: Domain is free of framework dependencies
- **WHEN** the architecture tests inspect the `Domain` assembly
- **THEN** no dependency on ASP.NET Core, Entity Framework Core, HTTP abstractions or the hosting
  abstractions is found

### Requirement: The profile is replaceable

The architecture profile SHALL be selected by `architecture.profile` in `project.config.json`, and
the repository SHALL document how to replace it. Selecting a profile other than the built-in ones
SHALL disable the layer-direction rules while keeping the dependency-cycle rules active.

#### Scenario: Custom profile keeps the invariant rules
- **WHEN** `architecture.profile` is set to `custom` and the architecture tests run
- **THEN** the layer-direction tests report themselves as not applicable, and the cycle tests still
  execute and pass

#### Scenario: Unknown profile is an error
- **WHEN** `architecture.profile` names a profile the repository does not define
- **THEN** the configuration check fails and lists the accepted values

### Requirement: Real dependencies are checked, not names

The rules SHALL be evaluated against compiled assembly references and against the project reference
graph parsed from the project files. Checking namespace names or the existence of directories SHALL
NOT be sufficient.

#### Scenario: An unused but declared project reference is caught
- **WHEN** a project file declares a forbidden `ProjectReference` that no code uses
- **THEN** the project-reference test fails and names the offending edge

#### Scenario: A forbidden assembly reference is caught
- **WHEN** code in `Domain` references a forbidden framework type
- **THEN** the assembly-level test fails and names the offending type and its origin

### Requirement: No dependency cycles

The rules SHALL detect cycles between projects and, when modules are declared, between modules.

#### Scenario: A cycle fails the test
- **WHEN** the project reference graph contains a cycle
- **THEN** the cycle test fails and prints the cycle path

### Requirement: Negative fixtures prove the rules detect violations

For each layer rule the repository SHALL provide a fixture that deliberately violates it, and a
test that fails if the rule does not report a violation on that fixture. Fixture assemblies SHALL
be excluded from the production rule set.

#### Scenario: A deliberately broken fixture is detected
- **WHEN** the negative tests evaluate each rule against its violating fixture
- **THEN** every rule reports at least one violation

#### Scenario: A weakened rule is caught
- **WHEN** a rule is weakened so that it no longer detects its fixture's violation
- **THEN** the corresponding negative test fails

### Requirement: An empty analysis set is a failure

Every architecture rule SHALL assert that it analysed a non-empty set of assemblies or projects. A
rule SHALL NOT report success because it found nothing to analyse.

#### Scenario: Missing assemblies fail rather than pass
- **WHEN** the architecture tests run against a configuration in which no production assembly is
  discovered
- **THEN** the tests fail with a message stating that the analysis set was empty
