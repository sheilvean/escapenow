# Rules

Layered, so a task loads what it needs and no more:

- `common/` — how work is done here, regardless of language.
- `dotnet/` — C#, testing and ASP.NET Core idioms. Path-scoped to the files they apply to.
- `architecture/` — derived from the profile selected in `project.config.json`.

A rule scoped with `paths:` in its frontmatter is loaded when a matching file is touched, rather
than sitting in context for every task.

Structure and precedence follow the layered pattern published in the ECC rules system
(github.com/affaan-m/ECC, MIT, commit e04ea0b, read 2026-09-07): more specific rules override
more general ones. The rule content here is the template's own; see `docs/attribution.md`.
