# Architecture

The template ships **one** architecture profile, `layered`, and one documented way to replace it.
It does not implement several alternatives speculatively: an unused architecture is a liability
that still has to be maintained, and the choice between them belongs to a real project with real
constraints.

## The layered profile

```
        Api  ─────────────────┐
         │                    │
         ├──▶ Infrastructure ─┤
         │         │          │
         └──▶ Application ◀───┘
                   │
                 Domain
```

| Layer | Project | May reference | Holds |
| --- | --- | --- | --- |
| Domain | `src/EscapeNow.Domain` | nothing in the solution | the rules and the vocabulary they are expressed in |
| Application | `src/EscapeNow.Application` | Domain | orchestration, and the ports it needs |
| Infrastructure | `src/EscapeNow.Infrastructure` | Domain, Application | adapters implementing those ports |
| Api | `src/EscapeNow.Api` | all three | composition, configuration, HTTP mapping |

Domain must additionally stay free of the web framework, an ORM, the hosting model, a DI container,
the configuration abstractions, `System.Net.Http` and `System.Data`. Application must stay free of
the web framework, an ORM, a DI container, and the options and configuration abstractions.

The direction and both forbidden lists are declared once, in
`tests/EscapeNow.ArchitectureTests/Support/LayeredProfile.cs`. Every rule reads them from there,
so the assembly-level checks and the project-reference checks cannot disagree about the policy.

## Why the Application layer has no `IOptions<T>`

`ReadinessService` takes a `ReadinessOptions` object, not an `IOptions<ReadinessOptions>`. The
composition root unwraps it:

```csharp
builder.Services.AddSingleton(static sp => sp.GetRequiredService<IOptions<ReadinessOptions>>().Value);
```

That one line is what keeps the options abstractions — and, transitively, a dependency-injection
model — out of the inner layers, and it makes the claim "Application depends on no framework"
true rather than aspirational. An architecture test enforces it.

## What the template actually implements

One vertical slice, chosen to be domain-neutral: a **readiness verdict**.

- `Domain/Readiness/ReadinessVerdict.Evaluate` decides whether the process should receive traffic,
  from its uptime, a warm-up period, and what the declared dependencies reported. It has real
  edges — a clock that moved backwards, a warm-up boundary, an empty dependency set, a stable
  ordering for the reason string — and the unit tests cover them.
- `Application/Readiness/ReadinessService` gathers the inputs through three ports and lets the
  domain rule decide. It adds a probe timeout, and reports a timed-out probe as **unavailable**:
  an unknown dependency state must never read as a healthy one.
- `Infrastructure/Readiness/*` implements the ports. `NoDependencyProbe` returns an empty
  collection, which the rule treats as a valid "nothing configured" state — it is not a stub for a
  future database.
- `Api` maps `/health/live` and `/health/ready`. The status code follows the verdict, because a
  load balancer reads the code and not the body.

This is a starting point to delete, not a domain to inherit. What is worth keeping is the shape:
the rule in Domain, the ports in Application, the adapters in Infrastructure, the mapping in Api.

## Three enforcement mechanisms, because one is not enough

Each catches something the others structurally cannot.

### 1. ArchUnitNET, at type level

`Types().That().ResideInAssembly(Domain).Should().NotDependOnAny(...)` over the four production
assemblies. Real compiled dependencies, but only among the assemblies handed to the loader.

Every rule goes through `RuleGuard.Check`, which asserts the analysed set is non-empty first.
ArchUnitNET 0.13.4 also rejects an empty selection by itself — a negative test documents that, so
an upgrade that removes the behaviour fails loudly. `WithoutRequiringPositiveResults()` switches
that protection off, which makes it the exact call someone would add to turn a red rule green;
another negative test proves `RuleGuard` still fails such a rule.

### 2. The compiled assembly reference list

Framework leakage, via `Assembly.GetReferencedAssemblies()`.

This does **not** go through ArchUnitNET, deliberately. A rule phrased as "no type in Domain may
depend on a type in `Microsoft.AspNetCore.*`" selects from a set that was never loaded — it would
be satisfied vacuously and report success while checking nothing. The metadata reference list is
what the compiler emitted, and a forbidden dependency cannot hide from it.

### 3. The project reference graph

Parsed from the `.csproj` files by `Support/ProjectGraph.cs`.

Assembly analysis cannot see a `ProjectReference` that no code uses: the compiler omits it from the
output. A declared-but-unused forbidden edge is still a declaration of intent, and the next commit
can start using it. This check also detects cycles across the whole repository, including test and
fixture projects.

Cycle detection is proven on fabricated in-memory graphs rather than a fixture on disk, because a
circular `ProjectReference` is an MSBuild error — the repository could not compile. Without those
tests, "no cycles found" would be indistinguishable from "the detector does not work".

## Negative fixtures

`tests/fixtures/` contains libraries that break the rules on purpose:

| Fixture | Violation |
| --- | --- |
| `Fixtures.Layers.Domain` | references `Fixtures.Layers.Infrastructure`, and the web framework |
| `Fixtures.Modules.Beta` | reaches past `Fixtures.Modules.Alpha`'s contract into its internals |

Each rule has a test that fails if the rule does **not** report a violation on its fixture. That
closes the loop: weakening a rule to make a real failure disappear turns its negative test red.

The fixtures are never part of the production rule set — production assemblies are loaded
explicitly by name from the configuration — so a deliberate violation here can neither trigger nor
mask a real finding. `Fixtures.Modules.Beta` also keeps a *legal* dependency on Alpha's contract
alongside the illegal one, which proves the rule does not simply flag every cross-module reference.

## Modules

`architecture.modules` in `project.config.json` is the registry. The template ships it empty.

When it is non-empty, a module may be reached only through its declared contract namespace. A type
that is public to the CLR but outside the contract is still internal to the module, and reaching it
is exactly the coupling module boundaries exist to prevent — invisible to any rule that only looks
at accessibility.

Rules are driven by the registry and the `{solutionName}.Modules.{Name}` convention, so registering
a module brings it under the rules with **no test file edited**. The registry is compared against
the projects present in both directions: a registered module with no project, and a module project
that is not registered, are both failures. The second is the one that matters — a module nobody
registered is a module outside the rules entirely.

## Replacing the profile

Set `architecture.profile` to `custom` in `project.config.json`.

The layer-direction rules then report themselves **skipped** — visible as skipped in the test
report, never as passed — while these keep running:

- the whole-repository cycle check;
- module boundary and registry consistency;
- every negative fixture test, so the detectors stay proven.

An acyclic dependency graph and a registry that matches reality are invariants of any architecture,
not properties of this one.

Verified: switching the profile to `custom` moves the architecture test run from 28 passed /
2 skipped to 20 passed / 10 skipped, with nothing failing.

Then: record the decision in `docs/adr/`, describe the new direction here, and — if you want it
enforced — add rules for it. `custom` means "the template does not check my layering", not "my
layering does not matter".

## Deliberately not here

No MediatR, no CQRS, no generic repository, no event bus, no AutoMapper, no result-monad library,
no Kubernetes manifests, no Aspire. Each can be right for a specific problem; none is right by
default. A library in a starter template is a decision nobody made — so if a change needs one,
argue for it in that change's design document.
