---
description: The test layout, the one runner, and the flags that must not be mixed.
paths:
  - "tests/**"
  - "**/*Tests.cs"
  - "global.json"
---

# Testing

## One framework, one runner

xUnit v3 on Microsoft.Testing.Platform. The runner is selected once, in `global.json`:

```json
{ "test": { "runner": "Microsoft.Testing.Platform" } }
```

VSTest remains the .NET SDK default, so this choice is explicit and must stay that way.

**Do not mix the two runners' flags.** VSTest options such as `--logger`, `--collect`, and
`/p:CollectCoverage` do not belong here. If a run needs an option, check that it is a
Microsoft.Testing.Platform option first.

## Categories are projects, not filters

| Project | What belongs in it |
| --- | --- |
| `tests/EscapeNow.UnitTests` | rules and orchestration, no I/O, no host |
| `tests/EscapeNow.ArchitectureTests` | dependency direction, cycles, module boundaries |
| `tests/EscapeNow.IntegrationTests` | the real host, started, driven over HTTP |
| `tests/fixtures/` | libraries that violate architecture rules on purpose |

Separate projects, not `--filter` categories: it keeps each check attributable to one command and
avoids depending on either runner's filter syntax. Add a test to the project that matches what it
exercises rather than adding a trait.

## Writing them

- `TestContext.Current.CancellationToken` for every awaited call in a test. xUnit v3 cancels a
  test that overruns, and a test that ignores the token hangs the run instead of failing.
- Hand-written fakes for ports, not a mocking framework. The ports here have one or two members;
  a fake reads better than a chain of setup calls, and the template does not impose a mock library.
- An integration test drives the real `Program` through `WebApplicationFactory`. Constructing the
  service classes directly does not prove the application boots, which is the thing worth knowing.
- Assert on the status code as well as the body when the status code carries meaning: a load
  balancer reads the code.
- `Assert.SkipUnless` / `Assert.SkipWhen` for a genuinely inapplicable test, with a reason that
  says why. A skipped test shows as skipped; that is the point. Never make a test pass vacuously
  instead.

## Architecture tests specifically

- Every rule goes through `RuleGuard`, which fails when the analysed set is empty. A rule with
  nothing to analyse passes, and that is the most dangerous way for these tests to be green.
- Never add `WithoutRequiringPositiveResults()`. It switches off ArchUnitNET's own empty-selection
  protection, and a negative test exists specifically to catch its use.
- Every rule has a negative fixture proving it detects its violation. Adding a rule means adding
  that fixture too.
- A red architecture test is a design question. Weakening the rule needs an ADR.
