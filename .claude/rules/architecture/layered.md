---
description: The layered profile's dependency direction, and what to do when a rule blocks you.
paths:
  - "src/**"
  - "tests/*ArchitectureTests/**"
---

# Layered profile

Active when `architecture.profile` in `project.config.json` is `layered`. The direction and the
forbidden-namespace lists are defined once, in
`tests/EscapeNow.ArchitectureTests/Support/LayeredProfile.cs`, and both the assembly-level rules
and the project-reference rules read it from there.

## Direction

`Domain` references nothing else in the solution. `Application` references Domain only.
`Infrastructure` references Domain and Application and implements their ports. `Api` composes the
application and registers dependencies.

Domain must also stay free of the web framework, an ORM, the hosting model, a DI container, the
configuration abstractions, `System.Net.Http` and `System.Data`. Application must stay free of the
web framework, an ORM, a DI container, and the options and configuration abstractions — so a
service in Application takes a plain options object, never an `IOptions<T>`; the host unwraps it.

**`docs/ARCHITECTURE.md` has the diagram, the per-layer table and a worked example** of how one
request crosses all four layers. Read it when the shape of a change is in question.

## Why three checks, not one

Each catches something the others cannot:

- **ArchUnitNET, type level** — a type in one layer using a type in another. Sees real compiled
  dependencies, but only among the assemblies it was given.
- **Assembly reference list** — framework leakage. A rule phrased as "no type in Domain may depend
  on `Microsoft.AspNetCore.*`" would select from an assembly that was never loaded, and pass
  vacuously. The metadata reference list is what the compiler emitted.
- **Project reference graph** — a `ProjectReference` that no code uses yet. The compiler omits it
  from the output, so no assembly-level rule sees it, but it is a declared intent and the next
  commit can start using it. This check also detects cycles across the whole repository.

## When a rule blocks you

It is telling you the design and the code disagree. Three legitimate responses:

1. Move the code to the layer it belongs in. Usually this is the answer.
2. Introduce a port in Application and implement it in Infrastructure, if the inner layer needs
   something the outer layer has.
3. Argue that the rule is wrong, in an ADR, and get a human's approval.

Not legitimate: widening a forbidden list, excluding a file, adding
`WithoutRequiringPositiveResults()`, or moving a type into a namespace that happens not to match.
A negative fixture exists for every rule, so weakening one turns its negative test red — but the
reason not to do it is that the rule was the point.

## Replacing the profile

Set `architecture.profile` to `custom`. The layer-direction rules then report themselves skipped —
visible as skipped in the test report, never as passed — while the whole-repository cycle check and
every negative fixture test keep running: an acyclic graph is an invariant of any architecture, and
the detectors have to stay proven either way. Record the replacement in an ADR and describe the new
direction in `docs/ARCHITECTURE.md`.
