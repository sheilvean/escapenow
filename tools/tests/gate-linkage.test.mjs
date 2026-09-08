/**
 * Archive linkage over a real commit range.
 *
 * "Deleting a change directory is not archiving it" is the one claim the gate makes that cannot be
 * checked from the working tree alone — it needs two commits and a diff between them. So these
 * cases build actual git repositories and actual commits. Fabricating the diff output instead
 * would test the parser and leave the thing that matters unexercised: the `git diff` invocation
 * and the `--name-status` shape it returns, including how a rename is reported.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateArchiveGate } from '../lib/gate.mjs';
import { run } from '../lib/proc.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'gate-linkage-tests');

const baseConfig = {
  openspec: {
    archiveGate: { enabled: true, scope: 'repository', requireZeroActiveChanges: true },
  },
};

/** The context GitHub Actions would supply for a pull request. */
const prContext = { isPullRequest: true, baseRef: 'origin/trunk' };

function git(repo, argv) {
  const result = run('git', argv, { cwd: repo });
  assert.equal(
    result.status,
    0,
    `git ${argv.join(' ')} failed in ${repo}: ${result.stderr || result.stdout}`
  );
  return result;
}

/**
 * A git repository the gate can evaluate, with a base commit and an `origin/trunk` ref for the
 * diff to run against.
 */
function makeGitRepo(name, { changes = [] } = {}) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, 'openspec', 'changes', 'archive'), { recursive: true });

  fs.writeFileSync(path.join(repo, 'openspec', 'config.yaml'), 'schema: spec-driven\n', 'utf8');

  for (const change of changes) {
    fs.mkdirSync(path.join(repo, 'openspec', 'changes', change), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'openspec', 'changes', change, 'proposal.md'),
      '## Why\nA test change.\n\n## What Changes\n- nothing\n',
      'utf8'
    );
  }

  // The real CLI, reached through a shim, so the gate exercises its actual read path.
  const binDir = path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const realBin = path.join(ROOT, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
  fs.writeFileSync(
    path.join(binDir, 'openspec.js'),
    `import(${JSON.stringify('file:///' + realBin.replace(/\\/g, '/'))});\n`,
    'utf8'
  );

  git(repo, ['init', '-q', '-b', 'trunk']);
  git(repo, ['config', 'user.email', 'gate-tests@example.invalid']);
  git(repo, ['config', 'user.name', 'gate tests']);
  // The shim holds an absolute path, and the diff the gate reads is only ever about openspec/.
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'base']);
  git(repo, ['update-ref', 'refs/remotes/origin/trunk', 'HEAD']);

  return repo;
}

/** Move the base ref forward, so the next commits form the range under review. */
function markBase(repo) {
  git(repo, ['update-ref', 'refs/remotes/origin/trunk', 'HEAD']);
}

function commit(repo, message) {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', message]);
}

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

describe('a removed change must have a matching archive entry', () => {
  test('deleting a change without archiving it blocks the gate', () => {
    const repo = makeGitRepo('deleted', { changes: ['abandoned-work'] });

    fs.rmSync(path.join(repo, 'openspec', 'changes', 'abandoned-work'), {
      recursive: true,
      force: true,
    });
    commit(repo, 'remove the change directory');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'blocked', verdict.summary);
    assert.match(verdict.summary, /without a matching archive entry/);
    assert.match(verdict.details.join('\n'), /abandoned-work/);
    assert.match(verdict.details.join('\n'), /not archiving it/);
  });

  test('an archive entry carrying a date prefix counts', () => {
    // This is the shape archiving actually produces: both `openspec archive` and the
    // /opsx:archive workflow prepend YYYY-MM-DD- to the directory name. The other cases in this
    // file originally archived without the prefix, so they all passed while the gate rejected
    // every real archive move — found by running the gate against this repository's own archive
    // commit, not by these tests. The convention now has a case of its own.
    const repo = makeGitRepo('dated', { changes: ['dated-change'] });

    fs.renameSync(
      path.join(repo, 'openspec', 'changes', 'dated-change'),
      path.join(repo, 'openspec', 'changes', 'archive', '2026-09-08-dated-change')
    );
    commit(repo, 'archive with the conventional dated name');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'passed', verdict.summary + verdict.details.join('\n'));
    assert.match(verdict.details.join('\n'), /all 1 removed change/);
  });

  test('a dated archive entry from an earlier commit also counts', () => {
    const repo = makeGitRepo('dated-earlier', { changes: ['two-step-dated'] });

    const archived = path.join(
      repo,
      'openspec',
      'changes',
      'archive',
      '2026-09-08-two-step-dated'
    );
    fs.mkdirSync(archived, { recursive: true });
    fs.writeFileSync(path.join(archived, 'proposal.md'), '## Why\nArchived earlier.\n', 'utf8');
    commit(repo, 'archive copy, dated');
    markBase(repo);

    fs.rmSync(path.join(repo, 'openspec', 'changes', 'two-step-dated'), {
      recursive: true,
      force: true,
    });
    commit(repo, 'remove the active copy');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'passed', verdict.summary + verdict.details.join('\n'));
  });

  test('a date prefix does not make an unrelated entry count', () => {
    // The complement: prefix-stripping must not turn "any dated directory" into a match.
    const repo = makeGitRepo('dated-wrong', { changes: ['wanted'] });

    const unrelated = path.join(repo, 'openspec', 'changes', 'archive', '2026-09-08-something-else');
    fs.mkdirSync(unrelated, { recursive: true });
    fs.writeFileSync(path.join(unrelated, 'proposal.md'), '## Why\nOther.\n', 'utf8');
    fs.rmSync(path.join(repo, 'openspec', 'changes', 'wanted'), { recursive: true, force: true });
    commit(repo, 'delete one change, archive a different one');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'blocked', verdict.summary);
    assert.match(verdict.details.join('\n'), /removed without archive: wanted/);
  });

  test('moving a change into the archive passes', () => {
    const repo = makeGitRepo('moved', { changes: ['finished-work'] });

    fs.renameSync(
      path.join(repo, 'openspec', 'changes', 'finished-work'),
      path.join(repo, 'openspec', 'changes', 'archive', 'finished-work')
    );
    commit(repo, 'archive the change');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'passed', verdict.summary + verdict.details.join('\n'));
    assert.match(verdict.details.join('\n'), /archive linkage: all 1 removed change/);
  });

  test('a change archived in an earlier commit of the same branch still counts', () => {
    // The archive entry is on disk but was added before the range being diffed. Failing here
    // would block a branch for having done the right thing one commit too early.
    const repo = makeGitRepo('earlier', { changes: ['two-step'] });

    const archived = path.join(repo, 'openspec', 'changes', 'archive', 'two-step');
    fs.mkdirSync(archived, { recursive: true });
    fs.writeFileSync(path.join(archived, 'proposal.md'), '## Why\nArchived earlier.\n', 'utf8');
    commit(repo, 'archive copy');
    markBase(repo);

    fs.rmSync(path.join(repo, 'openspec', 'changes', 'two-step'), { recursive: true, force: true });
    commit(repo, 'remove the active copy');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'passed', verdict.summary + verdict.details.join('\n'));
  });

  test('a range with no removals says so, rather than claiming a check it did not make', () => {
    const repo = makeGitRepo('none');

    fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'a change elsewhere\n', 'utf8');
    commit(repo, 'unrelated work');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'passed');
    assert.match(verdict.details.join('\n'), /no change directories were removed/);
  });

  test('without a pull-request context the linkage is reported unchecked, not verified', () => {
    // "We looked and it was fine" and "there was no range to look at" are different facts, and
    // only one of them is evidence.
    const repo = makeGitRepo('no-context');

    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'passed');
    assert.match(verdict.details.join('\n'), /not checked/);
    assert.match(verdict.details.join('\n'), /not as verified/);
  });

  test('an unreadable commit range fails closed', () => {
    const repo = makeGitRepo('bad-ref');

    const verdict = evaluateArchiveGate(repo, baseConfig, {
      isPullRequest: true,
      baseRef: 'origin/does-not-exist',
    });

    assert.equal(verdict.verdict, 'read-error', verdict.summary);
    assert.match(verdict.summary, /Could not read the commit range/);
  });

  test('a rename out of the archive is not mistaken for archiving', () => {
    // Un-archiving: the change becomes active again. The removed-side path is under archive/, so
    // it must not register as a removed active change, and the added active directory must not
    // register as an archive entry.
    const repo = makeGitRepo('unarchive');

    const archived = path.join(repo, 'openspec', 'changes', 'archive', 'reopened');
    fs.mkdirSync(archived, { recursive: true });
    fs.writeFileSync(path.join(archived, 'proposal.md'), '## Why\nWas archived.\n', 'utf8');
    commit(repo, 'an archived change');
    markBase(repo);

    fs.renameSync(archived, path.join(repo, 'openspec', 'changes', 'reopened'));
    commit(repo, 'reopen it');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    // It is an active change now, so the gate blocks on the count — not on a bogus linkage error.
    assert.equal(verdict.verdict, 'blocked', verdict.summary);
    assert.deepEqual(verdict.activeChanges, ['reopened']);
    assert.doesNotMatch(verdict.summary, /without a matching archive entry/);
  });

  test('two removals, one archived, blocks and names only the unarchived one', () => {
    const repo = makeGitRepo('mixed', { changes: ['done-properly', 'just-deleted'] });

    fs.renameSync(
      path.join(repo, 'openspec', 'changes', 'done-properly'),
      path.join(repo, 'openspec', 'changes', 'archive', 'done-properly')
    );
    fs.rmSync(path.join(repo, 'openspec', 'changes', 'just-deleted'), {
      recursive: true,
      force: true,
    });
    commit(repo, 'archive one, delete the other');

    const verdict = evaluateArchiveGate(repo, baseConfig, prContext);

    assert.equal(verdict.verdict, 'blocked', verdict.summary);

    const details = verdict.details.join('\n');
    assert.match(details, /just-deleted/);
    assert.doesNotMatch(details, /removed without archive: done-properly/);
  });
});
