# GitHub setup

**This repository performs no writes against GitHub.** It has no `gh` dependency, no API token, and no
script that changes repository settings. Everything on this page is a manual administrative step
that belongs to whoever owns the repository.

That separation is deliberate: local tooling that silently configured a remote account would be
doing the one thing nobody asked it to do, and it could not be reviewed before it happened.

## What this repository does ship

`.github/workflows/pr.yml`, and nothing else. Its safety properties — least-privilege
permissions, SHA-pinned actions, no `pull_request_target`, no secrets for fork pull requests, and
an aggregate that cannot go green on a skipped job — are listed once, under "CI safety" in
`SECURITY.md`, and verified by the `workflows` check stage.

## What is deliberately absent

**No `CODEOWNERS`. No branch protection or ruleset configuration.**

The repository owner decided against both. The accepted risk is recorded in
`docs/adr/0006-no-codeowners-or-branch-protection.md`, and stated plainly in `SECURITY.md`.

In short: nothing requires a human owner's review before someone changes the architecture rules,
the negative fixtures that prove those rules work, the CI workflows, the permission rules, the
hooks, `tools/**`, or the archive gate policy. CI still runs and still detects those changes — what
is missing is the requirement that a second person looks.

There is also **no** `CODEOWNERS` with placeholder teams. A file naming teams that
do not exist looks like working protection, which is worse than none: it answers "is this
protected?" with a yes.

## If you want the protection

Nothing in the repository needs to change. Three steps, all in GitHub:

### 1. Create `.github/CODEOWNERS`

Real people or real teams only. Suggested paths, in the order that matters:

```
# Architecture rules and the fixtures that prove they work
/tests/EscapeNow.ArchitectureTests/Support/   @your-team
/tests/fixtures/                                @your-team

# What "green" means
/.github/workflows/                             @your-team
/tools/                                         @your-team

# The agent's own boundaries
/.claude/settings.json                          @your-team
/.claude/hooks/                                 @your-team
/.claude/agents/                                @your-team

# Policy and toolchain
/project.config.json                            @your-team
/global.json                                    @your-team
/Directory.Packages.props                       @your-team

# The protection itself
/.github/CODEOWNERS                             @your-team
```

The last line is the one people forget. Without it, the protection can be edited by anyone.

### 2. Configure a ruleset

Repository → Settings → Rules → Rulesets → New branch ruleset, targeting your default branch:

- **Require a pull request before merging**, with at least one approval.
- **Require review from Code Owners.**
- **Dismiss stale approvals when new commits are pushed** — an approval of an earlier diff is not
  an approval of this one.
- **Require status checks to pass**, naming the checks below.
- **Block force pushes** and **restrict deletions.**
- Leave bypass actors **empty**. A bypass list with your own name in it is the protection switched
  off for the person most likely to be in a hurry.

### 3. Required check names

These are the job names in `.github/workflows/pr.yml`. They are stable — changing one means
updating the ruleset, so treat them as an interface:

| Check name | What it covers |
| --- | --- |
| `checks` | the ten-stage `node tools/repo.mjs check --ci` |
| `dependency-scan` | `dotnet list package --vulnerable` and `npm audit` |
| `secret-scan` | pinned gitleaks binary, verified by SHA-256 |
| `archive-gate` | zero active OpenSpec changes, and archive linkage |
| `required` | the aggregate; asserts each of the above explicitly |

Marking **`required`** as the single required check is enough, and is the safer choice: it fails
when any of the others is skipped or cancelled, which a per-job requirement does not always catch.

These names are verified: `node tools/repo.mjs check` fails if a workflow stops defining a job this
page names, and reports it if this page stops mentioning one the workflows define.

## Verifying the state, without changing it

Nothing here reads or writes your GitHub configuration, so verification is manual. Read-only
commands, if you have `gh` installed and authenticated:

```bash
gh api "repos/:owner/:repo/rulesets"                          # rulesets
gh api "repos/:owner/:repo/branches/$(gh api repos/:owner/:repo --jq .default_branch)/protection"
gh api "repos/:owner/:repo/codeowners/errors"                 # unresolvable owners
```

The last one is worth running after step 1: it reports owners GitHub cannot resolve, which is how a
`CODEOWNERS` file ends up looking effective while protecting nothing.

Note that `gh` is **not** a dependency of this repository — it was not installed on the machine
where this repository was built, and no check requires it.

## Merge queue

If you enable a merge queue, the workflow already handles `merge_group` events, so the checks run
for the queued combination rather than only for the branch as it was at approval time.

Keep the same required checks for the queue. A queue with weaker checks than the branch is a queue
that merges what the branch would have rejected.

## What is not configured, and is not pretended to be

| | Status |
| --- | --- |
| CODEOWNERS | **not configured** — owner's decision, ADR 0006 |
| Branch protection / rulesets | **not configured** — owner's decision, ADR 0006 |
| Merge queue | **not configured** — supported by the workflow if you enable it |
| GitHub secret scanning | **not relied upon** — paid for private repositories; CI scans with the gitleaks CLI instead |
| Dependabot | **not configured** — `docs/updating-dependencies.md` describes the manual procedure |
| Environments and deployment protection rules | **not configured** — no deployment in v1 |

None of these is reported anywhere as passing. "Not configured" is a distinct outcome, and it is
the honest one.
