---
description: How a change moves from problem to merge, and where a human must decide.
---

# Workflow

## Review comes before the code

The contract is reviewed first: proposal, specs, design. Producing them and then implementing in
the same turn removes the only cheap point at which a wrong direction can be corrected, so it is
not allowed even when the request says "just build it".

`/opsx:propose` creates planning artifacts. Stop after it. Wait for a new instruction.

## A change is Standard by default

Trivial is a narrow exception, not a shortcut. It requires all of: no change in behaviour, no
change to a contract, no change to permissions, and no change to architecture. It still needs
tests, review and CI.

These do **not** make a change Trivial:

- a small diff — line count says nothing about consequence;
- a dependency change — a new, removed or upgraded dependency alters what the software is;
- a statement in the pull request that it is trivial;
- being "just" a rename, when the renamed thing is part of a public contract.

If unsure, it is Standard.

## Order of operations

1. Read the existing code and the relevant specs before proposing anything.
2. Propose. Stop.
3. Implement only what the approved contract covers. If implementing reveals the contract is
   wrong, say so and stop — do not quietly widen it.
4. Run `node tools/repo.mjs check`.
5. `/opsx:verify`.
6. Stop for code review.
7. `/opsx:archive`, then the archive gate.

## What not to do

- Do not create a competing plan/apply workflow. OpenSpec owns that; a second one splits the
  history of why things changed.
- Do not archive a change on a human's behalf. The Stop hook reminds; it does not decide.
- Do not mark a task done in `tasks.md` that you have not actually completed and verified.
- Do not open with a summary of what you are about to do and then not do it. Report outcomes.
