<!--
This template asks for intent and evidence. None of the boxes below is proof of anything: a
checkbox records a claim, and CI records a fact. Where the two disagree, CI is right.
-->

## Intent

<!-- Why this change exists, in one or two sentences. What problem does it solve, and why now?
     Not what the diff does — the diff already says that. -->

## Change

**Class:** Standard / Trivial

<!-- Standard is the default. Trivial requires ALL of: no behaviour change, no contract change,
     no permission change, no architecture change — and it still needs tests, review and CI.
     A small diff, a dependency bump, or "it's just a rename" do not make a change Trivial.
     If you picked Trivial, say which of the four conditions you checked and how. -->

**OpenSpec change ID:** <!-- e.g. add-scheduling-window -->

**Artifacts:** <!-- openspec/changes/<id>/ before archiving; openspec/changes/archive/<id>/ after -->

<!-- Trivial changes have no OpenSpec change. Write "n/a (Trivial)" and give the reason above. -->

## Contract review

<!-- The proposal, specs and design are reviewed BEFORE the code. Link the review, name the
     reviewer, or say why this change did not need one. -->

Reviewed by:
Reviewed at:

## What was run, and what it said

<!-- Paste the summary line, not a claim. If a stage failed or did not run, say so here — a known
     failure that is written down can be fixed; one reported as green cannot. -->

```
$ node tools/repo.mjs check
Summary:  passed,  failed,  not configured, of 10 stage(s).
```

- `/opsx:verify` result:
- Anything **not** verified, and why (no runtime, no permission, no network):

## Closing

- [ ] `/opsx:archive` run, keeping the current specs
- [ ] `node tools/repo.mjs archive-gate` passes

<!-- A draft may run the fast checks with an active change. It cannot pass the gate: draft state
     is deliberately not an input to the policy. -->

## Impact worth a reviewer's attention

<!-- Delete the lines that do not apply. Anything left here should be argued for above. -->

- [ ] Changes an architecture rule, a project reference, or the module registry — **ADR required**
- [ ] Changes `.claude/settings.json` or hooks — permission boundaries
- [ ] Changes `.github/workflows/**` — what "green" means
- [ ] Changes `tools/**` — the tooling every check runs through
- [ ] Adds, removes or upgrades a dependency — pinned exactly? free in every configuration?
      recorded in `docs/attribution.md`?
- [ ] Changes a public contract — HTTP shape, persisted format, configuration key
- [ ] Deletes or weakens a test, a negative fixture, or a check stage

## Notes for the reviewer

<!-- Where to start, what you are unsure about, what you deliberately left out of scope.
     Naming your own doubts is the most useful thing in this template. -->
