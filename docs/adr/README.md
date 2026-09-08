# Architecture decision records

One file per durable decision. An ADR records **why**, so that a future reader can tell a
deliberate choice from an accident — and so that changing it is a decision rather than an edit.

Format: Context, Decision, Consequences, and Alternatives considered. Status is one of
`accepted`, `superseded by NNNN`, or `rejected`. An accepted ADR is not rewritten; it is
superseded by a new one.

Write an ADR when a change would:

- alter the architecture profile, the dependency direction, or an architecture rule;
- add or remove a dependency that shapes how code is written;
- change the permission boundaries, the hooks, or the archive gate policy;
- accept a risk rather than mitigate it.

A red architecture test is the most common trigger. Weakening the rule needs one of these; making
the code obey it does not.

| ADR | Decision |
| --- | --- |
| 0001 | Layered architecture as the single default profile |
| 0002 | Microsoft.Testing.Platform and xUnit v3 as the one runner |
| 0003 | ArchUnitNET plus an own project-reference graph check |
| 0004 | OpenSpec as a project-local, pinned dev dependency |
| 0005 | One check entry point, shared with CI |
| 0006 | No CODEOWNERS and no branch protection (accepted risk) |
| 0007 | Only free dependencies, in every configuration |
| 0008 | Angular on the LTS line, built with `@angular/build` and tested with Vitest |
| 0009 | PostgreSQL 18.6 from Compose, on Rancher Desktop (dockerd), without EF |

## A note on wording

ADRs 0001–0007 were written while this repository was also distributed as a reusable
`dotnet new` template, and several of them argue in those terms — what a template should impose,
what it should leave to a downstream project. That capability was retired by the
`retire-template-capability` change; the decisions themselves still stand, for the reasons
recorded.

Their wording is deliberately left as written. An accepted ADR is superseded, never rewritten:
editing the rationale to match today's repository would make the record agree with the present at
the cost of no longer being a record.
