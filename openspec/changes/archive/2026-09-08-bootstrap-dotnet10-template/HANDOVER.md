# Handover

Working note, not a change artifact. Delete it when the change is archived.

## Where this stands

All 61 tasks in `tasks.md` are complete, plus three that were added while closing section 8
(8.5–8.7). What follows separates what was actually executed from what still cannot be.

### Verified by running it

```
node tools/repo.mjs check
  Summary: 10 passed, 0 failed, 0 not configured, of 10 stage(s).
    config, format, build, test:unit (20), test:arch (30: 28 passed / 2 skipped),
    test:integration (5), specs, agent-config, workflows, tools (231 tooling tests)

node tools/template-tests.mjs
  Template tests: 22 passed, 0 failed
  — generates two applications (AcmeOrders; Beta with root namespace Contoso.Beta, in a path
    containing a space) and runs restore plus the full check on both

dotnet new path, by hand
  dotnet new install ./ ; dotnet new dotnet10-openspec -n "Zeta.Service"
  → npm ci ; node tools/repo.mjs init --config project.config.json
  → doctor: no problems found ; check: 10 passed, 0 failed
  (the local template package was uninstalled again, so the machine is clean)
```

Each guardrail was also **mutation-tested** — the implementation was deliberately broken and the
tests were confirmed to notice:

| Mutation | Result |
| --- | --- |
| archive-linkage check always returns "archived" | 2 tests fail |
| `doctor` stops reporting `/opsx:verify` | 1 test fails |
| aggregate job checks only `failure`, ignoring `skipped`/`cancelled` | 12 tests fail |
| gitleaks checksum mismatch no longer fails closed | 1 test fails |
| a rule removed from the Domain forbidden list | negative fixture test fails |

A guardrail that has only ever been seen passing is not known to work. These are the receipts.

### Still NOT verified, and cannot be from here

**The workflows have never executed on GitHub Actions.** What *is* verified is everything that can
be checked without a runner:

- `actionlint` (WASM) reports no findings, and a deliberately broken workflow produces findings —
  so the linter is really linting;
- 15 policy rules, each with a negative case proving it fires: least-privilege permissions,
  SHA-pinned actions with version comments, no `pull_request_target`, `ready_for_review`, no
  repository secrets, per-job timeouts, `if: always()` on the aggregate, the aggregate reading
  every job's result, required job names matching `docs/github-setup.md`, and no step
  reimplementing a check instead of calling a `tools/` entry point;
- the aggregate job's script, **extracted from the shipped YAML and executed**, rejecting
  `skipped`, `cancelled`, `failure` and missing for every required job;
- the gitleaks download's fail-closed branch, **executed offline** with a planted archive: a
  mismatched digest deletes the archive, does not extract the binary, and fails.

What remains unverified is the part that needs a real runner and a real pull request:

| Unverified | Why |
| --- | --- |
| the jobs actually run green on `ubuntu-latest` | needs a runner: `actions/setup-dotnet` reading `global.json`, `npm ci` in CI, the real gitleaks download |
| the Windows leg of `template.yml`'s matrix | the suite passes on Windows locally, but not through the workflow |
| the `required` aggregate as a *GitHub* required check | needs a repository ruleset, which the owner decided against (ADR 0006) |
| merge queue behaviour | `merge_group` is declared and linted; no queue has run |

Do not report CI as working. Report it as "written, linted, and its decision logic executed
locally; never run on a runner."

## Things found while building, worth not rediscovering

- **ArchUnitNET 0.13.4 already fails an empty selection** ("The rule requires positive evaluation,
  not just absence of violations"). `WithoutRequiringPositiveResults()` switches that off, so
  `RuleGuard` keeps its own non-empty check as a second line. Two negative tests pin both facts.
- **Every forbidden layer edge in a 4-project chain is a project cycle**, so MSBuild rejects it at
  restore time (MSB4006) before any architecture test runs. The project-graph rule earns its keep
  on the *acyclic* forbidden edge, which is what the `Fixtures.Layers.*` pair provides.
- **Renaming must go shallowest-first, final segment only.** Deepest-first creates the destination
  directory as a side effect, and the later directory rename then hits `EPERM` on Windows. Caught
  by the template test suite, not by review.
- **The actionlint WASM instance must not be reused across files.** Reusing one crashes with
  `RuntimeError: unreachable`, content-dependent — so it appears to work until a particular
  workflow triggers it. `runActionlint` creates one per file, and says why.
- **`node --test <dir>` does not work in Node 24** the way it reads; the check enumerates the files
  itself and passes `--test-reporter=tap`, because the default reporter is not stable to parse.
- **`dotnet new` drops `openspec/changes/` entirely** (the directory, not just its contents), so
  `init` recreates the `archive/` skeleton. It also drops `.template.config/`, which used to crash
  `rename-manifest.test.mjs` at module load — now skipped with a reason.
- **`solutionName` must allow dots.** `dotnet new -n "Zeta.Service"` is ordinary, and the first
  schema rejected it.
- **A fresh application has nothing to validate.** `openspec validate --all --strict` answers "No
  items found to validate." with exit 0, which is legitimate on day one. The `specs` stage now says
  so explicitly rather than letting "passed" imply a requirement was checked.
- **The forbidden-literal check fired on its own documentation** (a backticked branch name in a
  JSDoc comment explaining the rule). Restricted to `'` and `"` literals. A check that flags its
  own explanation teaches people to ignore it.
- **`doctor` reported the template's own uninitialized state as a failure**, which made it red in
  the one repository that is supposed to look like that. Now reported as `info`.

## Owner decisions already taken

- **No CODEOWNERS, no branch protection.** ADR 0006 records the accepted risk. Do not add them
  back without superseding it.
- **Only dependencies that are free in every configuration.** ADR 0007. This is why
  `gitleaks-action` and `trufflehog` are rejected, and why `actionlint` is the MIT WASM build
  rather than a downloaded Go binary.
- **The machine-wide OpenSpec profile was changed with consent** to add `verify` and `update`. The
  previous value was `["propose","explore","apply","sync","archive"]` if it ever needs restoring.

## Open question for the owner

There is **no `LICENSE` file**, but `package.json` declares `"license": "MIT"` and
`docs/attribution.md` points at "the repository's `LICENSE` file". That is an inconsistency, and
choosing the licence is the owner's decision — so no file was invented. Either add a `LICENSE`, or
change `package.json` and `docs/attribution.md` to match what you intend.

(The ECC material this template adapts is MIT, which requires its notice be retained where
substantial portions are copied. What was taken is structural rather than verbatim, and it is
credited in `docs/attribution.md`; a permissive licence here keeps that simple.)

## What `/opsx:verify` found, and what was done about it

The semantic pass over proposal, specs, design and tasks raised four things. Three were fixed in
this session; the fourth is a contract amendment a human needs to see.

1. **CONTRACT AMENDMENT — the spec listed nine check stages, the implementation had ten.** Adding
   the `workflows` stage was right, but it left `local-and-ci-checks` no longer describing the
   code. The delta spec now names it and adds two scenarios of its own, and design D13 records the
   amendment. **This is a change to an approved contract and is flagged for review, not slipped
   in.**

2. **Eight of ten `agent-config` rules had never been seen to fire.** The stage reported "no
   findings", which is worth nothing until each rule has failed on something — the same argument
   the negative architecture fixtures exist for, one layer up. `tools/tests/agentconfig.test.mjs`
   now has 35 negative cases plus a clean-copy control.

3. **A rule that never worked at all.** Writing case 2 exposed that the "absolute path inside a
   user profile" pattern used `` before a `/`, which cannot match a path preceded by a space —
   so `in /home/someone/` was never detected. Fixed with a negative lookbehind, and now covered by
   POSIX, Windows and complement cases. It had shipped in the previous commit.

4. **Two specification requirements were satisfied only by construction.** "Nothing outside the
   repository is written" and "no check needs a credential" were true of the code but asserted by
   nothing. `tools/tests/boundaries.test.mjs` runs `init`, `sync` and `doctor` against a redirected
   home directory and compares it byte-for-byte, and scans the tooling and workflows for
   credential-shaped reads. Mutating `applyRegions` to write into the home directory turns two of
   them red.

Also fixed: a new `checkRulePathScoping` rule, because the `Layered, path-scoped rules` requirement
has a scenario about it and nothing enforced it.

Two scenarios remain documentation-only and cannot be mechanically verified beyond checking that
the text exists: `Untrusted content is labelled` and `The weaker scope is labelled`. Both texts are
present, and the second is additionally visible in the gate's own output.

## What has not happened

- **`/opsx:verify`** — the semantic assessment of the implementation against these artifacts.
- **Human code review.** Nothing in this repository has been read by a person yet.
- **`/opsx:archive`.** The archive gate currently blocks, correctly, because this change is open.

Those three are the remaining steps, in that order, and the middle one is not the agent's to do.
