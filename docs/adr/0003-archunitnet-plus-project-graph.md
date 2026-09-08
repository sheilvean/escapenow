# 0003. ArchUnitNET plus an own project-reference graph check

Status: accepted
Date: 2026-09-07

## Context

The architecture rules had to check real dependencies — not namespace names, not directory layout —
and had to cover layer direction, framework leakage, dependency cycles, module boundaries and
registry consistency.

Two maintained libraries were candidates on .NET 10. Both target `netstandard2.0`, so both load:

| | ArchUnitNET 0.13.4 | NetArchTest.Rules 1.3.2 |
| --- | --- | --- |
| Licence | Apache-2.0 | MIT |
| Cycle detection | built in (`CycleDetection` dependency) | not built in |
| Slices | yes | no |
| Dependency surface | Mono.Cecil, Newtonsoft.Json, JetBrains.Annotations, CycleDetection | Mono.Cecil only |
| Empty selection | fails by default | passes |

## Decision

`TngTech.ArchUnitNET` 0.13.4 with `TngTech.ArchUnitNET.xUnitV3` 0.13.4, pinned exactly — **plus**
two checks that do not use it:

1. **Framework leakage** via `Assembly.GetReferencedAssemblies()`.
2. **The project reference graph** parsed from the `.csproj` files.

## Consequences

Each mechanism covers a gap the others structurally cannot:

- A rule phrased in ArchUnitNET as "no type in Domain may depend on `Microsoft.AspNetCore.*`"
  selects from an assembly that was never loaded. It is satisfied vacuously and reports success
  while checking nothing. The metadata reference list is what the compiler actually emitted, so a
  forbidden dependency cannot hide from it.
- ArchUnitNET cannot see a `ProjectReference` that no code uses, because the compiler omits it from
  the output. That reference is still a declaration of intent, and the next commit can use it.
- Cycle detection has to be proven on fabricated in-memory graphs: a circular `ProjectReference` is
  an MSBuild error, so it cannot exist as a fixture on disk. Without those tests, "no cycles found"
  would be indistinguishable from "the detector does not work".

Costs accepted:

- Three mechanisms to maintain instead of one, and a reader has to know which is which. Mitigated
  by declaring the policy in one place, `Support/LayeredProfile.cs`, that all three read.
- ArchUnitNET is pre-1.0 and a `2.1.0-draft` exists, so an upgrade may churn the API. Mitigated by
  the exact pin and by keeping the project-graph check independent of the library — if ArchUnitNET
  became unusable, cycle and direction checking would survive.
- Four transitive dependencies rather than one.

Discovered while building this, and worth recording: ArchUnitNET 0.13.4 **fails** a rule whose
selection is empty ("The rule requires positive evaluation, not just absence of violations"), which
is better than assumed. `WithoutRequiringPositiveResults()` switches that protection off — making
it the exact call someone would add to turn a red rule green. `RuleGuard` therefore keeps its own
non-empty check as a second line, and a negative test proves it still catches a rule that opted out.

## Alternatives considered

**NetArchTest only.** Smaller dependency surface, but no cycle detection and no slices, so the
missing half would be hand-written anyway — and its empty-selection behaviour is the dangerous one.

**Roslyn analyzers.** They run per project and cannot see the solution reference graph.

**A hand-written checker over Mono.Cecil.** Full control, and a maintenance burden with no ceiling.
Rejected for a template.
