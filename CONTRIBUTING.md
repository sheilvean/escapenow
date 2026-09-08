# Contributing

## Setup

```bash
npm ci                  # installs the pinned OpenSpec CLI from the lockfile
npm ci --prefix frontend # the Angular app has its own lockfile; check builds and tests it
dotnet restore
```

PostgreSQL is part of `check`. Install [Rancher Desktop](https://rancherdesktop.io/), set
**Container Engine** to **dockerd (moby)** so `docker` and `docker compose` work, then:

```bash
docker compose up -d
node tools/repo.mjs doctor
node tools/repo.mjs check
```

The Compose file publishes PostgreSQL 18.6 on `localhost:5432` with the demo credential
`escapenow` / `escapenow` / `escapenow` (user, database, password). That value is in git on
purpose; it is not a production secret. The host port must be free: a Windows PostgreSQL
service already listening on 5432 will take the connection instead of the container.

`doctor` reports and never repairs. If it says something is wrong, fix that before starting work —
a check that was already failing tells you nothing about your change.

## Review comes before the code

The contract is reviewed first: proposal, specs, design. That is the only cheap point at which a
wrong direction can be corrected, so it is not skipped — including when the request says "just
build it".

```
1. Understand the problem and the existing code.
2. /opsx:propose "<idea>"        → proposal, specs, design, tasks
3. ── a human reviews the contract ──          ← blocking
4. /opsx:apply                   → implement
5. node tools/repo.mjs check
6. /opsx:verify                  → semantic check against the artifacts
7. ── a human reviews the code ──              ← blocking
8. /opsx:archive                 → keeping the current specs
9. node tools/repo.mjs archive-gate
10. Merge.
```

Steps 3 and 7 are human decisions. Nothing in this repository makes them for you, and a checkbox
in a pull request is not one of them.

`tasks.md` is an execution artifact, not something a human has to sign off line by line. What gets
reviewed is the proposal, the specs and the design.

`/opsx:verify` is a semantic assessment of the implementation against the change artifacts. A green
build and a passing `openspec validate --all --strict` check different things — structure and
compilation — and neither is a substitute for it. Nor is it a substitute for step 7.

## Standard and Trivial

**A change is Standard unless a human has argued otherwise.** Standard means the full flow above.

**Trivial** skips only the OpenSpec artifact flow — steps 2, 3, 6 and 8. It still requires tests,
review and every CI check. It applies only when *all* of these hold:

- no change in observable behaviour;
- no change to a contract — an HTTP shape, a public API, a persisted format, a configuration key;
- no change to permissions, hooks, MCP configuration or CI;
- no change to architecture, project references or the module registry.

These do **not** make a change Trivial:

| Not a reason | Why |
| --- | --- |
| a small diff | line count is unrelated to consequence |
| a dependency change | a new, removed or upgraded dependency alters what the software is |
| "it's just a rename" | not if the renamed thing is part of a contract |
| a label or a sentence in the pull request | the policy is not self-service |
| the tests still pass | that is the floor, not the argument |

If you are weighing it up, it is Standard. The cost of the full flow on a genuinely small change is
minutes; the cost of skipping it on a change that turned out to matter is a decision nobody
recorded.

## The archive gate

Before a final merge, the repository must have zero active OpenSpec changes.

```bash
node tools/repo.mjs archive-gate
```

It reads `openspec list --json` from the pinned CLI and **fails closed**: a non-zero exit,
unparseable output, output without a `changes` array, or an unresolvable OpenSpec root each report
a read error — never "no active changes". A gate that guessed would be worse than no gate, because
it would look like evidence.

Deleting a change directory is not archiving it. On a pull request the gate compares the change
directories removed in the commit range against the archive entries added in it, and fails on a
removal with no matching entry.

A **draft** pull request may run the fast checks with an active change. It cannot pass the gate:
draft state is deliberately not an input to the policy.

## Before you ask for review

```bash
node tools/repo.mjs check
```

Every declared stage, in order. Read the summary and report it as it came out:

- `passed`, `failed` and `not-configured` are three different outcomes. A stage that is not
  configured is not a pass.
- A stage whose required files are missing is a **failure**, not a skip. You cannot delete your way
  to green.
- A test stage that executed zero tests **fails**. An empty run proves nothing.

Formatting is applied with a separate command, never as part of checking:

```bash
node tools/repo.mjs format --write
```

## When an architecture test goes red

It is telling you the design and the code disagree. Three legitimate responses:

1. Move the code to the layer it belongs in. Usually this is the answer.
2. Introduce a port in Application and implement it in Infrastructure.
3. Argue that the rule is wrong, in an ADR, and get a human's approval.

Not legitimate: widening a forbidden list, excluding a file, adding
`WithoutRequiringPositiveResults()`, switching `architecture.profile` to `custom`, or deleting a
negative fixture. Each of those turns a negative test red, so you would be caught — but the reason
not to do it is that the rule was the point.

## Writing an ADR

Write one when a change would alter the architecture, add or remove a shaping dependency, change
the permission boundaries or the gate policy, or accept a risk rather than mitigate it.

Format: Context, Decision, Consequences, Alternatives considered. See `docs/adr/README.md`. An
accepted ADR is superseded, never rewritten.

## Commit and pull request

- Small commits with a message that says why, not what. The diff says what.
- The pull request template asks for the intent and the change ID. Fill both in — after archiving,
  point at the entry under `openspec/changes/archive/`.
- Reference the requirement, not the ticket: `openspec/specs/<capability>/spec.md` outlives the
  tracker.

## Working with the agent

`CLAUDE.md` is what the agent reads on every session; `.claude/rules/` holds the scoped rules.

If you find yourself correcting the agent on the same thing repeatedly, that is worth encoding —
but write down what happened before deciding what to change, and prefer the strongest shape that
fits, not the easiest:

| Shape | When | Cost |
| --- | --- | --- |
| a test | the pattern is mechanically detectable | highest value: it fails on its own |
| an architecture rule | it is a dependency or boundary question | needs a negative fixture too |
| a check stage | detectable, but not as a test | one place, runs everywhere |
| a rule file | a judgement call a person has to make | advisory only; costs context every session |
| a skill | a procedure with steps and stopping conditions | loaded on demand, so cheap |

Prefer the top of that table. A file in `.claude/rules/` is text in a prompt — influential, not
binding — and it costs context on every session whether the task needs it or not. If the pattern
can be a test, make it a test: the agent cannot argue with a red test.

Two occurrences is a coincidence; three is a pattern. Either way it becomes a reviewed change like
any other. Nothing here observes your sessions or rewrites its own rules: a loop that rewrote the
rules from observed behaviour would encode whatever the agent happened to do, mistakes included,
and call it policy.

Do not let the agent widen its own permissions, weaken a rule, or archive a change. Those are
yours.
