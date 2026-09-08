# 0006. No CODEOWNERS and no branch protection

Status: accepted
Date: 2026-09-07

## Context

The design called for protecting the files that hold the project's decisions — the architecture
configuration and its tests, the workflows and validation scripts, the permission rules, hooks and
MCP configuration, the OpenSpec policy and archive gate, and CODEOWNERS itself — by requiring an
owner's review through a `CODEOWNERS` file plus GitHub rulesets or branch protection.

The repository owner reviewed that and decided against both: no `CODEOWNERS`, no branch-protection
or ruleset configuration.

## Decision

The template ships neither.

- No `.github/CODEOWNERS`, and no generator for one.
- No `owners` or `github` section in `project.config.json`.
- No documented ruleset configuration, and no script that would apply one.
- `docs/github-setup.md` states plainly that these are absent and what that leaves unprotected.

The alternative that was **not** taken: shipping a `CODEOWNERS` with placeholder teams. A file
naming teams that do not exist looks like working protection and is worse than nothing, because it
answers the question "is this protected?" with a yes.

## Consequences

This is an accepted risk, recorded so it stays visible as a decision rather than becoming an
oversight. Specifically, nothing requires an owner's review before someone changes:

- the architecture test project's `Support/LayeredProfile.cs` — the architecture rules;
- `tests/fixtures/**` — the fixtures that prove those rules detect violations;
- `.github/workflows/**` — what "green" means;
- `.claude/settings.json`, `.claude/hooks/**`, `.mcp.json` — the agent's own boundaries;
- `tools/**` — the tooling every check runs through, including the archive gate;
- `project.config.json` — the archive gate policy and the active profile.

What still applies, and is worth being precise about:

- **CI is unaffected.** Every check still runs on every pull request, and the archive gate still
  blocks a merge with an active change. A pull request that weakens a rule fails the negative
  fixture tests.
- **Weakening a rule is still detected.** The negative fixtures exist precisely so that a relaxed
  rule turns a test red. What is missing is the requirement that a *human owner* looks at it — not
  the detection.
- **The advisory hook still fires.** `protected-config-warning.mjs` names the file and says why it
  matters. It does not block, and it never claimed to.
- **`permissions.ask` still prompts.** `.claude/settings.json` puts the protected paths behind an
  ask rule, so an agent editing one surfaces a prompt to whoever is at the keyboard. That is a
  session-level control, not a repository-level one: it protects against an agent acting
  unnoticed, not against a person merging a change nobody reviewed.

Net effect: the protection that remains is *detection plus a prompt*, not *required review*. A
change that removes a check and also removes the test that would catch it can be merged by one
person without a second pair of eyes.

## Revisiting this

Adding the protection later needs no code change in the template — only repository settings and one
file:

1. Create `.github/CODEOWNERS` naming real people or real teams.
2. Configure a ruleset requiring review from code owners on the protected paths, with the check
   names from `.github/workflows/pr.yml` as required checks.
3. Supersede this ADR.

`docs/github-setup.md` lists the required check names, which is the part that is easy to get wrong.

## Alternatives considered

**Ship a `CODEOWNERS` with placeholder teams.** Rejected, and this is the important rejection: it
would create the appearance of protection without any of it.

**Generate `CODEOWNERS` from an `owners` field, and fail the check when it is empty.** This was the
recommended option. Rejected by the owner. It is what to build if this ADR is superseded.

**Approximate the protection with a hook that blocks edits to protected paths.** Rejected. A hook
is advisory and runs inside a session; calling it protection would be exactly the mislabelling
`SECURITY.md` warns against. It also would not touch the merge path, which is where the gap is.
