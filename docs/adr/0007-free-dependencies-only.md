# 0007. Only dependencies that are free in every configuration

Status: accepted
Date: 2026-09-07

## Context

"Free" has a soft edge in developer tooling. A tool can be free for an individual, free for a
public repository, free below a seat count, or free until an organization uses it — and a template
that adopts one of those quietly hands every downstream project a licence question it did not ask
for.

The repository owner's instruction was explicit: only dependencies that are free in every
configuration. A tool that is free for one setup and paid for another is excluded, not
conditionally accepted.

## Decision

Every build, test and check dependency must be free to use in every configuration: no licence key,
no paid tier, no per-seat entitlement, no "free for individuals" caveat. Licences are recorded in
`docs/attribution.md`.

Nothing in `build`, `test` or `check` may require a model API key, a Claude account, or any paid
service. CI does not run an AI agent by default.

## Consequences

Adopted (all MIT or Apache-2.0):

| Dependency | Licence |
| --- | --- |
| `@fission-ai/openspec` 1.12.0 | MIT |
| `ajv` 8.20.0, `ajv-formats` 3.0.1 | MIT |
| `xunit.v3` 4.0.0 | Apache-2.0 |
| `TngTech.ArchUnitNET` / `.xUnitV3` 0.13.4 | Apache-2.0 |
| `Microsoft.Testing.Platform`, `Microsoft.AspNetCore.Mvc.Testing` | MIT |
| `actions/checkout`, `actions/setup-node`, `actions/setup-dotnet` | MIT |
| `gitleaks` CLI | MIT |

Rejected, with reasons:

- **`gitleaks-action`.** Its repository declares no recognised licence, and v2 and later require a
  `GITLEAKS_LICENSE` key for organizations. Free for one configuration, paid for another — exactly
  the case this decision excludes. CI downloads the MIT-licensed **CLI** release instead, pinned by
  version and verified against a recorded SHA-256, and fails closed on a mismatch rather than
  executing an unverified binary.
- **`trufflehog`.** Free, but AGPL-3.0. Running it as a separate binary in CI would probably be
  fine; "probably fine" is not a licence position a template should hand downstream.
- **GitHub secret scanning and Dependabot alerts as the only mechanism.** Free for public
  repositories; secret scanning for private repositories is part of paid Advanced Security. The
  checks therefore do not depend on them. Enabling them where they are available is a bonus, not
  the plan.

Also decided by this: `ajv` is pinned at 8.20.0 rather than 8.17.1, because 8.17.1 is affected by
GHSA-2g4f-4pwh-qvx6 (ReDoS via the `$data` option). `npm audit` reports zero vulnerabilities at
8.20.0.

Costs accepted:

- Some convenience is given up. The gitleaks action would be three lines; downloading and
  checksumming the binary is about fifteen, and the checksum has to be updated on upgrade.
- A useful tool may have to be declined later on licence grounds alone. `docs/attribution.md` is
  where that gets argued, in the change that proposes it.

## Alternatives considered

**Allow tools that are free for the template's own use.** Rejected: the template's own use is
irrelevant. What matters is the configuration a downstream project ends up in, and the template
cannot know that.

**Allow a paid tool with a documented free alternative.** Rejected as a general rule — it makes
"is CI free?" answerable only by reading the workflow. Where a free alternative exists, that is
the one used.

**Skip secret scanning to avoid the question.** Rejected. A committed credential is the failure
mode with the worst blast radius, and the MIT CLI covers it.
