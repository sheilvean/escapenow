# Design

## Context

See `proposal.md` — Why. Two constraints shape everything below.

`openspec/specs/local-and-ci-checks/spec.md` requires a single implementation of the rules shared
with CI: nothing is validated by a command that exists only in CI. And
`openspec/specs/agent-configuration/spec.md` requires that protection boundaries are described
honestly — the hooks are advisory, `SECURITY.md` says so, and a new hook does not change that.

Current state relevant to the approach: `tools/lib/agentconfig.mjs` already runs eleven checks
including `checkMarkdownFrontmatter` and `checkDeclaredHooks`; `tools/lib/config.mjs` already
carries `findForeignKeys`, which is the same shape of assertion as dead-pin detection;
`tools/tests/hooks.test.mjs` already drives thirteen malformed payloads against three hooks.

## Goals / Non-Goals

Goals beyond the proposal's scope:

- Every new check starts green on the current tree. A check that fails on day one against the
  repository's own content teaches maintainers to disable checks.
- Every new check has a negative case that fails when the check is reverted.

Non-goals at design level:

- No new check stage. The run keeps ten stages.
- No new runtime dependency of any kind, including a shell.

## Decisions

### D1. The skill checks live in `agentconfig.mjs`, not in a shell script

The production repository implements this as a 103-line `validate-skill.sh` invoked from a skill.
Porting it would add a `bash` dependency to a check that must run identically on Windows, and would
create a second implementation of the rules — the thing `local-and-ci-checks` forbids.

Instead the four checks become functions in `tools/lib/agentconfig.mjs`, reported through the
existing `agent-config` stage. Rejected alternative: a new `skills` stage — a stage per assertion
inflates the report without adding information.

### D2. The guard hook fails open on unparseable input

Copied deliberately from production, whose hook carries the comment *"Malformed payload — fail open
so we never wedge legitimate edits."* That wording records an incident.

Trade-off accepted: a guard that permits the operation when it cannot read the payload can be
defeated by malforming the payload. That is acceptable precisely because the hook is advisory.
`SECURITY.md` already states that hooks catch mistakes rather than a determined attempt, and this
hook is in the same category. The alternative — fail closed — trades a real, recurring cost
(blocking legitimate work) for protection that was never available anyway.

### D3. Path matching normalises separators and matches a trailing segment

Production's first version matched a prefix and therefore missed edits made from inside a
subdirectory. The guard normalises `\` to `/` and matches the trailing segment, so absolute,
repository-relative and subdirectory-relative forms all hit. The spec pins this as a scenario
rather than leaving it to the implementation, because it is the failure that actually occurred.

### D4. Dead-pin detection extends the `config` stage

It is a configuration-consistency assertion, and `config` already owns that class of check via
`findForeignKeys`. The scan reads `Directory.Build.props` as well as every `.csproj`, because change
2 will inject analyzers globally from the convention file; a scan that read only project files would
report those analyzers as dead the moment they are added.

### D5. The bounds are measured against the current tree, not invented

Verified before choosing: all nine skills have names matching their directories, descriptions
between 135 and 276 characters, and bodies between 88 and 335 lines.

- description: 40–1024 characters (production's range; leaves headroom in both directions)
- body: 500 lines (current maximum is 335)

Recording the measurement matters: the numbers are defensible because the current content sits
inside them with margin, not because they were copied.

### D6. The OpenSpec-generated skills are not excluded

All nine current skills — the seven `openspec-*` skills included — pass all four checks. So no
exclusion is needed, and adding one pre-emptively would create a hole nobody could later justify.

Trade-off: a future `openspec update` could emit a skill that trips a bound. The remedy is then a
narrow exclusion with a written reason, or a bound revised with evidence — not switching the check
off. This is stated in the design so the next maintainer inherits the reasoning rather than the
conclusion.

### D7. The asset-path check needs a synthetic fixture

No skill in this repository references a `references/` or `scripts/` asset, so this check has no
positive case here and would pass vacuously. That is the same failure mode `RuleGuard` and the
negative fixtures under `tests/fixtures/` exist to prevent. It therefore ships with a synthetic
fixture in `tools/tests/` that references a missing asset and must fail.

### D8. Pitfalls are drawn from this repository, not from production's

Production's pitfalls are about Angular signals, EF Core seeding and Azure Container Apps. Copying
them would put failures this template cannot have into its context, which is how a lessons file
becomes noise. The entries come from this repository's archived handover and code comments — the
ArchUnitNET empty-selection behaviour, the Node 24 test-runner invocation, the actionlint WASM reuse
crash, the archive-gate date prefix, the `dotnet new` skeleton loss, and the Windows rename order.

Each entry names the mechanism that now detects it, so guidance is distinguishable from
enforcement. That pairing is the one idea taken wholesale from production.

### D9. `.gitattributes` keeps `*.slnx text eol=lf`

Production pins `.slnx` to CRLF; this template pins it to LF. The divergence is deliberate and is
noted in the file so it is not "corrected" later by someone comparing the two repositories.

## Risks / Trade-offs

- **The `workflows` stage might try to lint `dependabot.yml`** → confirm the stage globs
  `.github/workflows/*.yml` only. `dependabot.yml` sits in `.github/`, not `workflows/`, but the
  glob must be verified rather than assumed.
- **A fourth hook enlarges the hook-test matrix and the `checkDeclaredHooks` surface** → the
  registration is added to `.claude/settings.json` with an explicit timeout in the same change, so
  the existing check validates it immediately.
- **New prose in `.claude/**` could trip the stage's own forbidden-literal and secret patterns** →
  run the `agent-config` stage after each edit, not only at the end.
- **Dependabot's behaviour cannot be verified here** → the workflows have never run on a runner.
  Reported as unverified, never as working.
- **The body-length ceiling could one day fight the generator** → see D6; the response is evidence,
  not suppression.

## Migration Plan

None required. Nothing here changes a consumer contract, the configuration schema, the project
layout or the architecture profile. Rollback is a revert: the guard hook is additive, and the new
checks fail only on content that is already wrong.

## Open Questions

None. The two questions that would have changed the specs — whether the generated skills need an
exclusion, and whether the bounds trip the current tree — were resolved by measurement before this
document was written.
