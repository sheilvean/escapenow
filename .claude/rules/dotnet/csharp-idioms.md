---
description: C# conventions this repository actually enforces, and the ones it deliberately does not.
paths:
  - "**/*.cs"
  - "**/*.csproj"
  - "**/*.props"
---

# C# idioms

## Enforced by the build

These are not preferences — `dotnet format` and the analyzers fail the build on them, so match
them rather than discovering them:

- File-scoped namespaces, `using` directives outside the namespace.
- Nullable reference types enabled. Do not silence a nullable warning with `!` unless you can say
  in a comment why the value cannot be null there.
- `_camelCase` for private instance fields, `PascalCase` for private static readonly fields.
- `I`-prefixed interfaces, `PascalCase` types and members.
- Warnings are errors. See `.editorconfig` for the two analyzer rules that are switched off, each
  with its reason written next to it.

## Preferred

- Records for values, sealed classes for behaviour. Seal by default; unseal when something needs
  to derive.
- Primary constructors where the parameters are the dependencies.
- `ArgumentNullException.ThrowIfNull` and the other guard helpers, rather than a hand-written
  `if` and `throw`.
- Collection expressions (`[]`, `[a, b]`) over `new List<T> { ... }`.
- `StringComparison.Ordinal` explicitly on every string comparison that is not user-facing text.
  The default is a trap in a codebase that runs with `InvariantGlobalization`.
- `TimeProvider` or an injected clock port. Never `DateTime.Now` in code you want to test.
- `ConfigureAwait(false)` in library code, omitted in the host and in tests.

## Validation and errors

- Validate at the boundary of the type that owns the rule, in a factory or a constructor, so an
  invalid instance cannot exist. Do not validate the same thing again three layers up.
- Throw for a programming error — a null argument, an impossible state. Return a result for an
  expected outcome the caller must handle.
- An exception message says what was wrong with the input, and does not include the input's value
  when that value could be a secret.
- Cancellation is not a failure. Let `OperationCanceledException` propagate when the caller
  cancelled; do not convert it into a domain outcome.

## Not imposed

The template does not require MediatR, CQRS, a generic repository, an event bus, AutoMapper, or a
result-monad library. Each of them can be right for a specific problem; none of them is right by
default, and adding one to a starter template makes it a decision nobody made. If a change needs
one, argue for it in the design document.
