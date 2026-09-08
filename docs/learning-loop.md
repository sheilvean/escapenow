# The learning loop

An optional, entirely manual procedure for turning something you noticed into something the
repository enforces.

**No daemon. No background process. No self-modifying configuration.** Nothing in this repository
observes your sessions, accumulates a memory file, or proposes changes on its own. This page
describes four steps a person takes, each ending in a review.

## Why it is manual

An agent that could widen its own permissions or relax its own rules to make its work pass has no
boundary at all — the boundary would be whatever the agent last decided. The same argument applies
to a learning process: a loop that rewrote the rules from observed behaviour would encode whatever
the agent happened to do, including the mistakes, and would call it policy.

So the loop stops at a proposal every time. A human decides.

## The four steps

### 1. Observation

You notice a pattern. Concretely, one of:

- you have corrected the agent on the same thing three times;
- a review comment keeps recurring across changes;
- something broke in a way a rule would have prevented;
- a check failure was misread because its message did not say enough.

Write down what happened, not what you think should change. "The agent put validation in the
endpoint again, in `POST /orders` and in `POST /shipments`" is an observation. "We need a
validation rule" is already a proposal, and skipping to it loses the evidence.

Two occurrences is a coincidence. Three is a pattern worth a rule.

### 2. Proposal

Decide what shape the fix takes, and be honest that the strongest option is usually not a rule:

| Shape | When | Cost |
| --- | --- | --- |
| **A test** | the pattern is mechanically detectable | highest value: it fails on its own |
| **An architecture rule** | it is a dependency or boundary question | needs a negative fixture too |
| **A check stage** | it is detectable but not a test | one place, runs everywhere |
| **A rule file** | it is a judgement call a person has to make | advisory only; costs context every session |
| **A skill** | it is a procedure with steps and stopping conditions | loaded on demand, so cheap |

Prefer the top of that table. A rule in `.claude/rules/` is text in a prompt: influential, not
binding, and it costs context on every session whether or not the task needs it. If the pattern can
be a test, make it a test — the agent cannot argue with a red test.

If it does become a rule, choose scoping deliberately. A rule with `paths:` in its frontmatter
loads when a matching file is touched; an unscoped rule loads always. Most rules should be scoped.

### 3. Review

This is the step that makes the loop safe, and it is not optional.

Treat it as a **Standard** change: propose, get review, then implement. Specifically:

- A new architecture rule needs an ADR — it changes what the repository permits.
- A permission change needs a human's decision. Never an agent's.
- A new rule file needs someone to ask "is this a rule, or is it a test we did not write?"
- A skill needs its stopping conditions reviewed, because that is the part that gets skipped.

The agent may draft any of the above. It may not approve one, and it may not merge one.

### 4. Rule or skill

Implement the approved shape, with the same standards as any other change:

- A new architecture rule gets a negative fixture proving it detects its violation. Without one,
  it is a rule that might be checking nothing.
- A new check stage returns `failed` — not `not-configured` — when something required is missing.
- A new rule file says *why*, not just what. A rule whose reason is missing gets worked around the
  first time it is inconvenient.
- A new skill declares its usage conditions, inputs, steps, verification and stopping conditions.

Then run `node tools/repo.mjs check` and report the result as it came out.

## What this loop must never do

- **Weaken a rule.** If a rule fires too often, that is an observation to feed back into step 1 with
  evidence — not a licence to relax it. Weakening it also turns its negative test red.
- **Widen a permission.** `.claude/settings.json` changes are human decisions.
- **Add `WithoutRequiringPositiveResults()`**, exclude a file from a rule, or delete a negative
  fixture.
- **Accumulate a memory file that nobody reviews.** Anything that influences the agent is committed
  and reviewed like code. A rules file is loaded into every session; it deserves at least the
  scrutiny a source file gets.
- **Run in the background.** There is no watcher, and adding one would need its own ADR — including
  an honest account of what it would read and where that would be stored.

## When to remove a rule

Rules accumulate, and a rule nobody reads is worse than none: it makes the set feel authoritative
while parts of it are stale. Remove one when:

- a test now covers it — the test is strictly better;
- it has not been referenced in review for a long time and nobody can say what it prevents;
- it contradicts another rule, which means at least one of them was never applied;
- it describes a technology or a workflow the repository no longer uses.

Removing a rule is a change like any other: say what it prevented, and why that is now covered
elsewhere or no longer a risk.
