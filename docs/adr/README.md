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
