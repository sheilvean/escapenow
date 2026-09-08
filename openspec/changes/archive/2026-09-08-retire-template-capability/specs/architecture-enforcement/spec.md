## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Module boundaries and registry consistency

**Reason**: `architecture.modules` has been empty for the life of the repository, so the rules
never had a module to constrain. Supporting an empty registry cost a test class, a support class,
two deliberately-broken fixture projects and a forbidden-literal pattern that could not fire. The
`architecture.modules` key, the module rules, the module fixtures and that pattern are removed
together.

**Migration**: Introducing modules again means restoring `architecture.modules` in the
configuration and its schema, the registry-consistency and boundary rules, and a negative fixture
pair that proves the boundary rule fires — as one reviewed change with an ADR, since it reinstates
an architectural constraint. The whole-repository dependency-cycle check is unaffected and keeps
running.
