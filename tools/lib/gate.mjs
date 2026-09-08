/**
 * The archive gate.
 *
 * It answers one question — may this change be merged? — from data the OpenSpec CLI produces,
 * and it fails closed. A gate that reported "no active changes" because it could not read the
 * answer would be worse than no gate: it would look like evidence.
 *
 * Four distinct read failures are reported as read errors, never as an empty change set:
 * a non-zero CLI exit, unparseable output, output without a `changes` array, and an
 * unresolvable OpenSpec root. Each is checked in tools/lib/openspec.mjs and surfaced here with
 * `kind: 'read-error'`, which the caller must not treat as a policy pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import { listActiveChanges, OpenSpecReadError } from './openspec.mjs';
import { run } from './proc.mjs';

/** @typedef {'passed'|'blocked'|'read-error'|'not-configured'} GateVerdict */

/**
 * Evaluate the gate.
 *
 * @param {string} root Repository root.
 * @param {object} config The validated project configuration.
 * @param {{baseRef?: string, headRef?: string, isPullRequest?: boolean}} [context]
 *        CI context, detected from the event payload by the caller. Nothing here depends on a
 *        branch being called `main` or matching `feature/*`.
 * @returns {{verdict: GateVerdict, summary: string, details: string[], activeChanges: string[]}}
 */
export function evaluateArchiveGate(root, config, context = {}) {
  const policy = config.openspec.archiveGate;

  if (!policy.enabled) {
    // A disabled gate is reported as not configured. It is never reported as passed: switching
    // the policy off is a decision someone made, not evidence that the repository is clean.
    return {
      verdict: 'not-configured',
      summary: 'The archive gate is disabled in project.config.json (openspec.archiveGate.enabled).',
      details: [
        'This is a policy decision, not a pass. Re-enable it to have the closing state enforced.',
      ],
      activeChanges: [],
    };
  }

  // The configuration file OpenSpec itself reads. Unreadable configuration is a read error.
  const configYaml = path.join(root, 'openspec', 'config.yaml');
  if (!fs.existsSync(configYaml)) {
    return readError('openspec/config.yaml is missing, so the OpenSpec root cannot be trusted.', [
      `Expected at ${configYaml}.`,
      'Run `node tools/repo.mjs openspec init --tools claude` to restore the integration.',
    ]);
  }

  let listing;
  try {
    listing = listActiveChanges(root);
  } catch (error) {
    if (error instanceof OpenSpecReadError) {
      return readError(`Could not read the active changes: ${error.message}`, [
        error.detail || '(no further detail)',
        'The gate fails closed: an unreadable answer is not the same as "no active changes".',
      ]);
    }
    throw error;
  }

  const names = listing.changes.map((c) => c.name).sort();

  const inScope =
    policy.scope === 'pull-request'
      ? namesTouchedByPullRequest(root, names, context)
      : { names, note: 'scope: repository-wide (every active change counts)' };

  if (!policy.requireZeroActiveChanges) {
    return {
      verdict: 'not-configured',
      summary:
        'openspec.archiveGate.requireZeroActiveChanges is false, so the gate does not enforce ' +
        'a closing state.',
      details: [
        `${inScope.names.length} active change(s) in scope: ${inScope.names.join(', ') || 'none'}.`,
        'Reported as not configured rather than passed.',
      ],
      activeChanges: inScope.names,
    };
  }

  if (inScope.names.length > 0) {
    return {
      verdict: 'blocked',
      summary:
        `${inScope.names.length} active OpenSpec change(s) must be archived before the final merge.`,
      details: [
        inScope.note,
        ...inScope.names.map((n) => `  active: ${n}`),
        'Run /opsx:verify, then /opsx:archive, then re-run the gate.',
        'A draft pull request may run the fast checks with an active change; it cannot pass here.',
      ],
      activeChanges: inScope.names,
    };
  }

  // Zero active changes. One more question remains: was the change actually archived, or was its
  // directory simply deleted? Deleting a directory is not archiving.
  const removalCheck = checkRemovalsAreArchived(root, context);
  if (removalCheck.verdict !== 'passed') {
    return removalCheck;
  }

  return {
    verdict: 'passed',
    summary: 'No active OpenSpec changes.',
    details: [inScope.note, removalCheck.summary],
    activeChanges: [],
  };
}

function readError(summary, details) {
  return { verdict: 'read-error', summary, details, activeChanges: [] };
}

/**
 * The weaker, opt-in scope: only changes this pull request touched.
 *
 * Documented as an extension rather than an equivalent of the default. It lets a repository with
 * genuinely parallel changes merge one of them, and it accepts that other people's active changes
 * are not the gate's business. That is a real relaxation, and it is written down as one.
 */
function namesTouchedByPullRequest(root, names, context) {
  if (!context.isPullRequest || !context.baseRef) {
    return {
      names,
      note:
        'scope: pull-request was configured, but no pull-request context was detected, so the ' +
        'gate fell back to repository-wide. Falling back to the stricter scope is deliberate.',
    };
  }

  const diff = run('git', ['diff', '--name-only', `${context.baseRef}...HEAD`], { cwd: root });
  if (diff.status !== 0) {
    return {
      names,
      note:
        'scope: pull-request was configured, but the diff against the base ref could not be read, ' +
        'so the gate fell back to repository-wide rather than narrowing on a guess.',
    };
  }

  const touched = new Set(
    diff.stdout
      .split('\n')
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter((line) => line.startsWith('openspec/changes/'))
      .map((line) => line.slice('openspec/changes/'.length).split('/')[0])
      .filter((name) => name && name !== 'archive')
  );

  return {
    names: names.filter((n) => touched.has(n)),
    note:
      `scope: pull-request (weaker than the repository-wide default; ${touched.size} change ` +
      'directory/ies touched by this pull request)',
  };
}

/**
 * Verify that every change directory this pull request removed has a matching archive entry
 * added in the same range.
 *
 * This is the deterministic part of "a closed change is linked to the archive". Where the link
 * cannot be established — no pull-request context, or no readable diff — the check says so
 * instead of pretending to have verified it.
 */
function checkRemovalsAreArchived(root, context) {
  if (!context.isPullRequest || !context.baseRef) {
    return {
      verdict: 'passed',
      summary:
        'archive linkage: not checked (no pull-request context, so there is no commit range to ' +
        'compare). Reported as unchecked, not as verified.',
      details: [],
      activeChanges: [],
    };
  }

  const diff = run(
    'git',
    ['diff', '--name-status', '--diff-filter=ADR', `${context.baseRef}...HEAD`],
    { cwd: root }
  );

  if (diff.status !== 0) {
    return readError(
      'Could not read the commit range to verify that removed changes were archived.',
      [
        (diff.stderr || diff.stdout).trim() || '(no output)',
        'The gate fails closed rather than assuming the archiving happened.',
      ]
    );
  }

  const removedChanges = new Set();
  const addedArchives = new Set();

  for (const line of diff.stdout.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const status = parts[0];
    // A rename reports the destination last, which is exactly the archive move we want to see.
    const paths = parts.slice(1).map((p) => p.trim().replace(/\\/g, '/'));

    for (const [index, filePath] of paths.entries()) {
      const active = filePath.match(/^openspec\/changes\/(?!archive\/)([^/]+)\//);
      const archived = filePath.match(/^openspec\/changes\/archive\/([^/]+)\//);

      const isDestination = index === paths.length - 1;

      if (archived && (status.startsWith('A') || (status.startsWith('R') && isDestination))) {
        addedArchives.add(archived[1]);
      }
      if (active && (status.startsWith('D') || (status.startsWith('R') && !isDestination))) {
        removedChanges.add(active[1]);
      }
    }
  }

  const unarchived = [...removedChanges].filter((name) => !hasArchiveEntry(name, addedArchives, root));

  if (unarchived.length > 0) {
    return {
      verdict: 'blocked',
      summary:
        `${unarchived.length} change directory/ies were removed without a matching archive entry.`,
      details: [
        ...unarchived.map((n) => `  removed without archive: ${n}`),
        'Deleting a change directory is not archiving it. Run /opsx:archive so the change is ' +
          'recorded and the current specs are updated.',
      ],
      activeChanges: [],
    };
  }

  return {
    verdict: 'passed',
    summary:
      removedChanges.size === 0
        ? 'archive linkage: no change directories were removed in this range.'
        : `archive linkage: all ${removedChanges.size} removed change(s) have an archive entry.`,
    details: [],
    activeChanges: [],
  };
}

/**
 * An archive entry counts when it was added in this range, or when it already exists on disk —
 * the latter covers a change archived in an earlier commit of the same branch.
 *
 * The entry may carry a `YYYY-MM-DD-` prefix, because that is what archiving actually produces:
 * both `openspec archive` and the `/opsx:archive` workflow prepend the date unless the change
 * name already starts with one. An earlier version of this function compared the bare names and
 * so reported a correctly archived change as "removed without a matching archive entry" — it
 * failed closed, which is the safe direction, but it was still wrong, and the tests missed it
 * because their fixtures archived without the prefix.
 */
function hasArchiveEntry(name, addedArchives, root) {
  if (matchesArchiveName(name, addedArchives)) return true;

  const archiveDir = path.join(root, 'openspec', 'changes', 'archive');
  if (!fs.existsSync(archiveDir)) return false;

  let onDisk;
  try {
    onDisk = fs.readdirSync(archiveDir);
  } catch {
    return false;
  }

  return matchesArchiveName(name, new Set(onDisk));
}

/** Whether any candidate is the change name, with or without a leading date. */
function matchesArchiveName(name, candidates) {
  if (candidates.has(name)) return true;

  for (const candidate of candidates) {
    if (candidate.replace(/^\d{4}-\d{2}-\d{2}-/, '') === name) return true;
  }

  return false;
}
