# 0002. Microsoft.Testing.Platform and xUnit v3 as the one runner

Status: accepted
Date: 2026-09-07

## Context

The .NET 10 SDK introduced a choice of test runner, selected in `global.json`:

```json
{ "test": { "runner": "Microsoft.Testing.Platform" } }
```

VSTest remains the SDK default and can be omitted, so not choosing is itself a choice — and the two
runners have different command-line options, different coverage integration and different filter
syntax. Mixing their flags produces commands that appear to work and silently do something else.

## Decision

Microsoft.Testing.Platform, with xUnit v3 4.0.0, and nothing else. The runner is selected once, in
`global.json`.

Test categories are **separate projects** — `UnitTests`, `ArchitectureTests`, `IntegrationTests` —
not traits selected with `--filter`.

## Consequences

- Every check stage runs `dotnet test <one project>`. Each stage's result is attributable to one
  command, and the report prints that command verbatim.
- The repository depends on neither runner's filter syntax, so the "do not mix the flags" rule has
  nothing to violate.
- Adding a test means choosing the project that matches what it exercises. That is a slightly
  higher bar than adding a trait, and it keeps the categories meaningful.
- xUnit v3's `TestContext.Current.CancellationToken` is available and the rules require it: a test
  that ignores it hangs the run instead of failing.
- VSTest-era tooling that expects a `.trx` from `--logger` will not work without configuration.

Verified on SDK 10.0.300: `dotnet test` against both a single project and the `.slnx` solution runs
under MTP and reports the summary the check pipeline parses.

## Alternatives considered

**VSTest with `Microsoft.NET.Test.Sdk`.** Mature and familiar, but it is the legacy path on .NET 10,
and its coverage and filter flags differ from MTP's — inviting exactly the flag mixing this
decision exists to prevent.

**MTP with filters instead of separate projects.** Rejected: it re-couples the check pipeline to a
runner's filter syntax, and a mistyped filter silently runs zero tests. Separate projects make an
empty run obvious — and the check fails a stage that executed zero tests anyway.

**Two frameworks, one per category.** Rejected for the obvious reason: two vocabularies, two sets of
gotchas, no benefit.

**A coverage threshold.** Deliberately not added. A percentage does not tell you whether the risky
path is covered, and a threshold turns review attention into a number to satisfy.
