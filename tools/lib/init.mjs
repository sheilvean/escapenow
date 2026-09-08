/**
 * First-time initialization: turn the template into a named application.
 *
 * Two properties drive the design.
 *
 * Targeted, not repository-wide. Substitutions apply only to the globs declared in
 * tools/rename.manifest.json. A blind search and replace across the repository would rewrite
 * specifications, ADRs, archived changes and the OpenSpec-generated instructions — the very
 * files a template must not touch.
 *
 * Initialization is not reconfiguration. `init` runs once, recorded by `template.initialized`.
 * Changing a name afterwards does not rewrite an existing application's code: that is a manual
 * operation with real consequences, and doing it silently is worse than refusing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveTokens } from './config.mjs';
import { plannedRegions, applyRegions } from './generated.mjs';

export class InitError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'InitError';
    this.details = details;
  }
}

const toPosix = (p) => p.split(path.sep).join('/');

/** Files the manifest's content globs select, minus its exclusions. */
function selectFiles(root, globs, excludeGlobs) {
  const excluded = new Set(
    excludeGlobs.flatMap((g) => fs.globSync(g, { cwd: root, withFileTypes: false }).map(toPosix))
  );

  const isExcluded = (relative) =>
    excluded.has(relative) ||
    excludeGlobs.some((g) => {
      // A directory glob such as "node_modules/**" also covers everything beneath it.
      const prefix = g.replace(/\/\*\*$/, '');
      return relative === prefix || relative.startsWith(prefix + '/');
    });

  const files = new Set();
  for (const glob of globs) {
    for (const match of fs.globSync(glob, { cwd: root, withFileTypes: false })) {
      const relative = toPosix(match);
      if (isExcluded(relative)) continue;
      const absolute = path.join(root, relative);
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        files.add(relative);
      }
    }
  }

  return [...files].sort();
}

/**
 * Paths the manifest's rename globs select, **shallowest first**.
 *
 * The order matters and the opposite is a trap. Renaming the deepest path first means renaming
 * `tests/X.UnitTests/X.UnitTests.csproj` to `tests/Y.UnitTests/Y.UnitTests.csproj`, which creates
 * the new parent directory — and the later attempt to rename `tests/X.UnitTests` to
 * `tests/Y.UnitTests` then finds its destination occupied. On Windows that surfaces as
 * `EPERM: operation not permitted, rename`, which reads like a permissions problem and is not.
 *
 * Shallowest first, renaming only the final path segment, moves a directory with its contents
 * intact and leaves each nested name to be renamed afterwards.
 */
function selectRenameTargets(root, globs, token) {
  const targets = new Set();
  for (const glob of globs) {
    for (const match of fs.globSync(glob, { cwd: root, withFileTypes: false })) {
      const relative = toPosix(match);
      if (path.basename(relative).includes(token) || relative.includes(`/${token}`)) {
        targets.add(relative);
      }
    }
  }

  return [...targets].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
  );
}

/**
 * Which token value applies to a file's contents.
 *
 * The two tokens share one placeholder, so the file set decides: C# sources carry namespaces
 * (rootNamespace), while project files, the solution and the documentation carry the assembly and
 * project names (solutionName). When the two configured values are equal — the default — the
 * distinction is invisible, and `check` fails if they are made to differ without the projects
 * declaring an explicit RootNamespace.
 */
function valueForFile(relative, tokens) {
  const solutionName = tokens.find((t) => t.name === 'solutionName').value;
  const rootNamespace = tokens.find((t) => t.name === 'rootNamespace').value;
  return relative.endsWith('.cs') ? rootNamespace : solutionName;
}

/**
 * Build the plan without touching the working tree.
 *
 * @returns {{alreadyInitialized: boolean, placeholder: string, tokens: object[],
 *            contentEdits: Array<{file: string, occurrences: number, value: string}>,
 *            renames: Array<{from: string, to: string}>,
 *            regions: Array<object>, conflicts: string[]}}
 */
export function planInit(root, config, manifest) {
  const tokens = resolveTokens(config, manifest);
  const placeholder = manifest.placeholder.solutionName;

  if (config.template.initialized) {
    return {
      alreadyInitialized: true,
      placeholder,
      tokens,
      contentEdits: [],
      renames: [],
      regions: [],
      conflicts: [],
    };
  }

  const contentEdits = [];
  for (const relative of selectFiles(root, manifest.contentGlobs, manifest.excludeGlobs)) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    const occurrences = text.split(placeholder).length - 1;
    if (occurrences > 0) {
      contentEdits.push({ file: relative, occurrences, value: valueForFile(relative, tokens) });
    }
  }

  const solutionName = tokens.find((t) => t.name === 'solutionName').value;
  const renames = [];
  const conflicts = [];

  // Renames are recorded as (current path, new basename). Only the final segment is substituted:
  // the ancestors are renamed by their own entries, and because the list is shallowest-first, a
  // parent has already moved by the time its children are processed. `apply` therefore has to
  // re-map each `from` through the renames already applied.
  for (const relative of selectRenameTargets(root, manifest.renameGlobs, placeholder)) {
    const segments = relative.split('/');
    const basename = segments.at(-1);
    const newBasename = basename.split(placeholder).join(solutionName);
    if (newBasename === basename) continue;

    const to = [...segments.slice(0, -1), newBasename].join('/');

    // The destination is checked against the *logical* final path, so a genuine collision —
    // a file already using the new name — is reported rather than overwritten.
    const logicalTo = to.split('/').map((s) => s.split(placeholder).join(solutionName)).join('/');
    if (fs.existsSync(path.join(root, logicalTo))) {
      conflicts.push(`${relative} -> ${logicalTo} (the destination already exists)`);
      continue;
    }

    renames.push({ from: relative, to, basename: newBasename });
  }

  const regions = plannedRegions(root, config, manifest);

  return {
    alreadyInitialized: false,
    placeholder,
    tokens,
    contentEdits,
    renames,
    regions,
    conflicts,
  };
}

/**
 * Apply the plan.
 *
 * Order matters: contents first, then renames. Rewriting a file after moving it would mean
 * tracking both paths, and a crash between the two steps would leave the tree half-renamed with
 * stale contents. Doing contents first means an interrupted run leaves files that still build.
 */
export function applyInit(root, config, manifest, plan, { dryRun }) {
  const applied = { contentEdits: 0, renames: 0, regions: [] };

  if (plan.conflicts.length > 0) {
    throw new InitError(
      'Initialization stopped: renaming would overwrite existing paths. Nothing was changed.',
      plan.conflicts
    );
  }

  for (const edit of plan.contentEdits) {
    const file = path.join(root, edit.file);
    const text = fs.readFileSync(file, 'utf8');
    const updated = text.split(plan.placeholder).join(edit.value);
    if (updated !== text) {
      if (!dryRun) fs.writeFileSync(file, updated, 'utf8');
      applied.contentEdits++;
    }
  }

  // Renames, shallowest first. Each entry's recorded `from` was captured before any rename ran,
  // so an ancestor that has already moved has to be substituted in — otherwise the path no longer
  // exists. Only the final segment changes, so a directory moves with its contents intact and no
  // destination is created ahead of time.
  const movedPrefixes = [];

  for (const rename of plan.renames) {
    const from = remapAncestors(rename.from, movedPrefixes);
    const to = [...from.split('/').slice(0, -1), rename.basename].join('/');

    if (!dryRun) {
      const absoluteFrom = path.join(root, from);
      const absoluteTo = path.join(root, to);

      if (!fs.existsSync(absoluteFrom)) {
        throw new InitError(
          `Rename target disappeared during initialization: ${from}. The working tree may be ` +
            'half-renamed; inspect it with `git status` before re-running.',
          [`planned: ${rename.from} -> ${rename.to}`, `resolved: ${from} -> ${to}`]
        );
      }
      if (fs.existsSync(absoluteTo)) {
        throw new InitError(
          `Cannot rename ${from} to ${to}: the destination already exists. Nothing further was ` +
            'changed.',
          ['This usually means the repository was partly renamed by a previous, failed run.']
        );
      }

      fs.renameSync(absoluteFrom, absoluteTo);
    }

    if (from !== to) movedPrefixes.push({ from, to });
    applied.renames++;
  }

  // Regions are rendered from the configuration, so they are correct regardless of the renames.
  applied.regions = applyRegions(root, plan.regions, dryRun);

  applied.createdDirectories = ensureOpenSpecSkeleton(root, dryRun);

  if (!dryRun) {
    markInitialized(root, plan.tokens);
  }

  return applied;
}

/**
 * Create the OpenSpec directories the CLI and the archive gate expect.
 *
 * Needed on the `dotnet new` path: the template excludes `openspec/changes/**` so a generated
 * application does not inherit the template's change history, and the template engine drops the
 * whole directory rather than keeping an empty `archive/`. Rather than depend on the engine's glob
 * semantics to keep one subdirectory, `init` finishes the job — and it is a no-op on the
 * GitHub-template path, where the directories are already there.
 *
 * @returns {string[]} Directories that were missing.
 */
function ensureOpenSpecSkeleton(root, dryRun) {
  const required = [
    path.join('openspec', 'specs'),
    path.join('openspec', 'changes', 'archive'),
  ];

  const created = [];

  for (const relative of required) {
    const absolute = path.join(root, relative);
    if (fs.existsSync(absolute)) continue;

    created.push(relative.split(path.sep).join('/'));
    if (dryRun) continue;

    fs.mkdirSync(absolute, { recursive: true });
    // Git does not track an empty directory, so the placeholder is what makes the structure
    // survive a clone.
    fs.writeFileSync(path.join(absolute, '.gitkeep'), '', 'utf8');
  }

  return created;
}

/**
 * Rewrite a path so that already-renamed ancestors are reflected in it.
 *
 * The longest matching prefix wins, so nesting is handled correctly when several ancestors moved.
 */
function remapAncestors(relative, movedPrefixes) {
  let result = relative;

  for (const { from, to } of [...movedPrefixes].sort((a, b) => b.from.length - a.from.length)) {
    if (result === from) return to;
    if (result.startsWith(from + '/')) {
      result = to + result.slice(from.length);
    }
  }

  return result;
}

/**
 * Record that initialization happened, so a second `init` refuses instead of running again.
 * Written last: if anything above failed, the repository is still marked uninitialized and the
 * command can be re-run after the cause is fixed.
 */
function markInitialized(root, tokens) {
  const configPath = path.join(root, 'project.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  config.template.initialized = true;
  config.template.appliedTokens = Object.fromEntries(tokens.map((t) => [t.name, t.value]));

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Whether the repository looks like it came through `dotnet new`, where the template engine has
 * already applied the substitutions. Such a repository has no placeholder left but is not yet
 * marked initialized, and `init` should record the state rather than claim to have renamed
 * anything.
 */
export function looksPreRenamed(plan) {
  return (
    !plan.alreadyInitialized && plan.contentEdits.length === 0 && plan.renames.length === 0
  );
}
