# 0001. Layered architecture as the single default profile

Status: accepted
Date: 2026-09-07

## Context

A template has to start a project somewhere architecturally. Two failure modes are available:
impose a structure so elaborate that every project fights it, or ship nothing and let each project
reinvent the layering — badly, and differently.

The requirement was a simple profile with an explicit dependency direction, an unambiguous way to
replace it, and no speculative alternatives implemented "just in case".

## Decision

One profile, `layered`: Domain has no solution dependencies; Application depends on Domain;
Infrastructure depends on Application and Domain and implements their ports; the host composes and
registers. Business logic lives in Domain, not in endpoints and not in the composition root.

The direction is declared once, in the architecture test project's `Support/LayeredProfile.cs`,
and every rule reads it from there.

`architecture.profile: custom` is the escape hatch. Under it the layer-direction rules report
themselves skipped, while cycle detection and module-registry consistency keep running — those are
invariants of any architecture.

## Consequences

- A project that wants a different architecture sets one configuration value and writes an ADR. It
  does not have to delete rules that fight it.
- `custom` deliberately does not enforce a replacement. The template cannot know what to enforce,
  and a rule that guesses is worse than no rule.
- Application taking options as a plain object rather than `IOptions<T>` is a real constraint that
  falls out of this decision. It is enforced, and it is explained in `docs/ARCHITECTURE.md`.
- Layer names are fixed by the `{solutionName}.{Layer}` convention. Renaming a layer means changing
  the profile definition, which is intentional friction.

## Alternatives considered

**Ship several profiles (layered, vertical slice, modular monolith) and let the project pick.**
Rejected: three profiles means three sets of rules and three sets of negative fixtures to maintain,
and at least two of them unexercised in any given repository. Unexercised rules rot.

**Ship no architecture rules and document the intent.** Rejected: a documented direction that
nothing checks is a direction that has already drifted by the third sprint. The point of the
template is that the rules are executable.

**Enforce the profile with analyzers instead of tests.** Rejected: an analyzer runs per project and
cannot see the solution reference graph, which is where the cycle and direction questions live.
