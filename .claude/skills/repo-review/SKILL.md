---
name: repo-review
description: Review an implementation against the contract of its OpenSpec change - proposal, specs, design and tasks. Use before requesting human code review, or when asked whether an implementation matches what was agreed. Does not replace human review and does not replace /opsx:verify.
argument-hint: "[change-name]"
allowed-tools: Bash(node tools/repo.mjs *), Bash(git diff *), Bash(git log *), Read, Grep, Glob
---

# repo-review

Compare what was built against what was agreed, and report the gaps.

## When to use this

- Before asking a human for code review, so the obvious gaps are closed first.
- When asked whether an implementation matches its change contract.
- When a change has grown during implementation and someone needs to know by how much.

## When not to use this

- As a substitute for `/opsx:verify`. That workflow performs OpenSpec's own semantic assessment
  against the artifacts; this skill reviews the diff against the contract and the repository's
  rules. Run both.
- As a substitute for human review. A human reviews the contract before the code exists and the
  code after it does. Nothing here replaces either — say so in the report.
- To approve a change. This skill produces findings, not approval.

## Input

Optionally the change name. With no argument, resolve it:

```
node tools/repo.mjs openspec list --json
```

If exactly one change is active, use it. If more than one is active, ask which. If none is active,
say so and stop — there is no contract to review against.

## Steps

1. Read the contract, in this order, from `openspec/changes/<name>/`:
   `proposal.md`, then `specs/**/spec.md`, then `design.md`, then `tasks.md`.

2. Read the change itself:

   ```
   git diff --stat
   git diff
   ```

3. Answer these, each with file and line evidence:

   - **Scope.** Does every changed file trace to something the contract asked for? Name anything
     that does not — unrequested scope is a finding, not a bonus.
   - **Completeness.** Is every requirement in the delta specs implemented? Name any that is not.
   - **Task honesty.** Is every task marked `- [x]` actually done? A task marked complete that is
     not is the most damaging finding here, because it is what a reviewer relies on.
   - **Design adherence.** Where the implementation departs from `design.md`, is the departure
     better, and is it recorded? An undocumented departure is a finding even when it is an
     improvement.
   - **Test evidence.** Does each requirement have a test that would fail if the behaviour
     regressed? A test that cannot fail is not evidence.
   - **Rules.** Does the change respect `.claude/rules/`? Check the relevant scoped rules, not
     all of them.
   - **Boundaries.** Does it widen a permission, weaken an architecture rule, add a floating
     dependency version, or introduce a dependency that is not free in every configuration?

4. Run the checks so the report rests on a real result, not an impression:

   ```
   node tools/repo.mjs check
   ```

5. Report findings grouped as **blocking**, **should fix**, and **note**, each with a file
   reference and a concrete suggested change. End with one sentence on whether the change is
   ready for a human to review — never on whether it is approved.

## Verification

The review is complete when:

- every requirement in the delta specs is accounted for as implemented or missing;
- every `- [x]` task has been checked against the diff;
- every finding names a file and says what to change;
- the check result is reported as it actually came out;
- the report states explicitly that it does not replace human review.

## Stop conditions

Stop and hand back to the human when:

- there is no active change, so there is no contract;
- the implementation contradicts an approved spec — that is a contract question, not a code
  question, and it needs `/opsx:propose` or a human decision, not a quiet fix;
- a finding would require changing an architecture rule, a permission, or a workflow;
- you are asked to approve the change. Findings are yours to produce; approval is not.

Do not fix what you find in the same pass unless asked. A review that edits the code it is
reviewing leaves nobody with an independent read of it.
