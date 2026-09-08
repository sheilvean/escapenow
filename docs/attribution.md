# Attribution and licences

## Sources consulted while building this repository

All checked **2026-09-07**. Instructions found inside external material were treated as data, not
as authorisation to act — see `SECURITY.md`.

| Source | Revision | What was taken |
| --- | --- | --- |
| [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | commit `e04ea0b9cc8248686edf5ac751cadff550e162b8` (2026-09-03), **MIT** | *Adapted*: the layered rule layout (`common/` plus a language directory) and the "more specific overrides more general" precedence; from `the-security-guide.md`, the deny-by-default permission posture, the untrusted-content boundary, the separate-agent-identity argument, and the framing that a container shares the host kernel and so is weaker than hardware virtualization. *Not taken*: the TypeScript and Python rule content, the coverage thresholds, the installer, the learning daemon, and everything installed into `~/.claude`. |
| [`Fission-AI/OpenSpec`](https://github.com/Fission-AI/OpenSpec) | `@fission-ai/openspec` 1.12.0, **MIT** | Consumed as a pinned dependency. The CLI contract, the `config.yaml` schema, the profile model, the `list --json` shape and the generated-file boundary were read from the package and from `--help`, and verified by running it. |
| OpenSpec documentation | `openspec.dev/docs/installation`, `/docs/profiles` | Installation and profile model. `/docs/opsx` and `/docs/customization` returned **HTTP 404**; those gaps were filled from `--help` output and by reading `dist/core/profiles.js` of the pinned package. |
| Claude Code documentation | `code.claude.com/docs/en/{hooks,settings,permissions,skills,sub-agents}` | Hook event and output schema, `stop_hook_active`, exit-code semantics, `${CLAUDE_PROJECT_DIR}`, permission rule syntax and precedence, settings precedence, `SKILL.md` frontmatter, agent frontmatter and `model: inherit`. |
| Microsoft Learn | `dotnet/core/tools/dotnet-test`, `dotnet/core/tools/templates` | Test runner selection via `global.json` in the .NET 10 SDK; `template.json` fields, symbols, `sourceName`, and local installation with `dotnet new install`. |
| nuget.org | queried 2026-09-07 | Available versions and licence expressions for the pinned NuGet packages. |
| GitHub REST API | queried 2026-09-07 | Action release tags and commit SHAs; dependency licence identifiers. |

The ECC MIT licence requires the copyright notice and permission notice to be retained wherever
substantial portions are copied. What was taken from ECC is structural and conceptual rather than
verbatim text, and the two places that follow its structure carry a source note in the file itself:
`.claude/rules/README.md` and the layout of `.claude/rules/`. This page is the repository-level
record.

## Dependency licences

Every dependency below is free to use in **every** configuration: no licence key, no paid tier, no
per-seat entitlement, no "free for individuals" caveat. That is a hard rule — see
`docs/adr/0007-free-dependencies-only.md`.

### Node (dev-only, `package.json`)

| Package | Version | Licence |
| --- | --- | --- |
| `@fission-ai/openspec` | 1.12.0 | MIT |
| `ajv` | 8.20.0 | MIT |
| `ajv-formats` | 3.0.1 | MIT |
| `actionlint` | 2.0.6 | MIT |
| `yaml` | 2.9.0 | ISC |

`ajv` is pinned at 8.20.0 rather than 8.17.1 because 8.17.1 is affected by GHSA-2g4f-4pwh-qvx6
(ReDoS via the `$data` option). `npm audit` reports zero vulnerabilities at 8.20.0.

`actionlint` here is the **WASM** build of the Go linter (npm package `actionlint`, MIT). It was
chosen over the Go binary specifically because it needs no download at check time and no network:
`npm ci` installs it like any other dependency, and it runs the same on every platform. The
upstream Go project (`rhysd/actionlint`) is MIT as well.

`yaml` is ISC — permissive, and free in every configuration. It parses the workflows so the
`workflows` check stage can assert the safety properties `SECURITY.md` and `docs/github-setup.md`
promise, rather than pattern-matching the text.

### NuGet

| Package | Version | Licence |
| --- | --- | --- |
| `xunit.v3` | 4.0.0 | Apache-2.0 |
| `TngTech.ArchUnitNET` | 0.13.4 | Apache-2.0 |
| `TngTech.ArchUnitNET.xUnitV3` | 0.13.4 | Apache-2.0 |
| `Microsoft.AspNetCore.Mvc.Testing` | 10.0.8 | MIT |

Transitive, via ArchUnitNET: `Mono.Cecil` (MIT), `Newtonsoft.Json` (MIT), `JetBrains.Annotations`
(MIT), `CycleDetection` (MIT). Microsoft.Testing.Platform arrives through xUnit v3 and the SDK
(MIT).

The .NET SDK and the ASP.NET Core shared framework are MIT and are not vendored — they come from
the toolchain `global.json` pins.

### GitHub Actions

| Action | Version | Commit SHA | Licence |
| --- | --- | --- | --- |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | MIT |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` | MIT |
| `actions/setup-dotnet` | v6.0.0 | `a98b56852c35b8e3190ac28c8c2271da59106c68` | MIT |

Pinned by SHA, with the version in a comment beside each — the comment is the only readable record
of which version a SHA is.

### CI tools not consumed as packages

| Tool | Licence | How it is used |
| --- | --- | --- |
| `gitleaks` CLI | MIT | a version-pinned release archive, verified against a recorded SHA-256; a mismatch fails the job **without executing the binary**. Pinned at 8.30.1, digest `551f6fc8…`, taken from that release's own `checksums.txt` |

## Rejected on licence grounds

Recorded because "why isn't this here?" is a fair question, and the answer should not have to be
rediscovered:

| Rejected | Reason |
| --- | --- |
| `gitleaks-action` | The repository declares no recognised licence, and v2+ requires a `GITLEAKS_LICENSE` key for organizations — free in one configuration, paid in another. The MIT-licensed CLI is used instead. |
| `trufflehog` | Free, but AGPL-3.0. Running a separate binary in CI is probably fine; "probably fine" is not a licence position to hand downstream. |
| GitHub secret scanning as the only mechanism | Free for public repositories; for private ones it is part of paid Advanced Security. The checks therefore do not depend on it. |

## This repository

See the repository's `LICENSE` file. This repository's own content — the rules, skills, agents, hooks,
tooling, architecture rules and documentation — is this repository's own work, written for this
repository.
