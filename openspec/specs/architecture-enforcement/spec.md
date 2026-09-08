## Purpose

Makes the chosen architecture profile an executable rule set rather than a description, so a
violation fails a test instead of surviving until review.

## Requirements

### Requirement: Default layered profile with a declared dependency direction

The template SHALL ship one default architecture profile named `layered`, in which `Domain` depends
on no other project of the solution, `Application` depends only on `Domain`, `Infrastructure`
depends on `Application` and `Domain` and implements their ports, and the host composes the
application and registers dependencies. Business logic SHALL NOT reside in HTTP endpoints or in the
composition root.

#### Scenario: Allowed direction passes
- **WHEN** the architecture tests run against the template's own solution
- **THEN** every layer rule passes

#### Scenario: Domain is free of framework dependencies
- **WHEN** the architecture tests inspect the `Domain` assembly
- **THEN** no dependency on ASP.NET Core, Entity Framework Core, HTTP abstractions or the hosting
  abstractions is found

### Requirement: The profile is replaceable

The architecture profile SHALL be selected by `architecture.profile` in `project.config.json`, and
the template SHALL document how to replace it. Selecting a profile other than the built-in ones
SHALL disable the layer-direction rules while keeping the cycle and module-registry rules active.

#### Scenario: Custom profile keeps the invariant rules
- **WHEN** `architecture.profile` is set to `custom` and the architecture tests run
- **THEN** the layer-direction tests report themselves as not applicable, and the cycle and
  registry tests still execute and pass

#### Scenario: Unknown profile is an error
- **WHEN** `architecture.profile` names a profile the template does not define
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

### Requirement: Module boundaries and registry consistency

When `architecture.modules` is non-empty, access from one module to another SHALL be permitted only
through that module's declared contract surface, and access to a module's internals SHALL be
detected. The declared registry SHALL match the projects present in the solution. Rules SHALL be
driven by convention and by the registry, and module names SHALL NOT be written into individual
tests.

#### Scenario: A new module is covered without editing tests
- **WHEN** a module fixture is added to the registry and to the solution
- **THEN** the existing module tests cover it with no test file modified

#### Scenario: Reaching into module internals fails
- **WHEN** one module references a type outside another module's contract surface
- **THEN** the module boundary test fails and names both modules and the offending type

#### Scenario: Registry drift fails
- **WHEN** the registry lists a module absent from the solution, or the solution contains a module
  project absent from the registry
- **THEN** the registry consistency test fails and reports the difference in both directions

### Requirement: Negative fixtures prove the rules detect violations

For each rule the template SHALL provide a fixture that deliberately violates it, and a test that
fails if the rule does not report a violation on that fixture. Fixture assemblies SHALL be excluded
from the production rule set.

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
