/**
 * Archive gate tests.
 *
 * The gate's most important property is what it does when it cannot read its input: a gate that
 * reported "no active changes" on a read failure would be worse than no gate, because it would
 * look like evidence. Every failure mode below must come back as `read-error`, never as `passed`.
 *
 * Each case builds a throwaway repository under artifacts/, so nothing here depends on the state
 * of the real one.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateArchiveGate } from '../lib/gate.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'gate-tests');

const baseConfig = {
  openspec: {
    archiveGate: { enabled: true, scope: 'repository', requireZeroActiveChanges: true },
  },
};

/**
 * A minimal repository the gate can evaluate: openspec/config.yaml plus a symlink-free copy of
 * the installed CLI path. The CLI itself is reused from the real node_modules, because the point
 * is to exercise the real read path rather than a stub of it.
 */
function makeRepo(name, { withConfigYaml = true, withCli = true, changes = [] } = {}) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, 'openspec', 'changes', 'archive'), { recursive: true });

  if (withConfigYaml) {
    fs.writeFileSync(path.join(repo, 'openspec', 'config.yaml'), 'schema: spec-driven\n', 'utf8');
  }

  for (const change of changes) {
    fs.mkdirSync(path.join(repo, 'openspec', 'changes', change), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'openspec', 'changes', change, 'proposal.md'),
      '## Why\nA test change.\n\n## What Changes\n- nothing\n',
      'utf8'
    );
  }

  if (withCli) {
    // Reuse the real installed CLI by pointing the expected path at it via a junction-free copy
    // of the bin entry, which re-resolves its own dist/ relative to the real package.
    const target = path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin');
    fs.mkdirSync(target, { recursive: true });
    const realBin = path.join(ROOT, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    fs.writeFileSync(
      path.join(target, 'openspec.js'),
      `import(${JSON.stringify('file:///' + realBin.replace(/\\/g, '/'))});\n`,
      'utf8'
    );
  }

  return repo;
}

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

describe('policy outcomes', () => {
  test('passes with no active change', () => {
    const repo = makeRepo('clean');
    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'passed', verdict.summary);
    assert.deepEqual(verdict.activeChanges, []);
  });

  test('blocks with one active change, and names it', () => {
    const repo = makeRepo('one-active', { changes: ['add-something'] });
    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'blocked');
    assert.deepEqual(verdict.activeChanges, ['add-something']);
    assert.match(verdict.details.join('\n'), /add-something/);
  });

  test('the archive directory is not an active change', () => {
    const repo = makeRepo('archived-only');
    const archived = path.join(repo, 'openspec', 'changes', 'archive', 'old-change');
    fs.mkdirSync(archived, { recursive: true });
    fs.writeFileSync(path.join(archived, 'proposal.md'), '## Why\nDone.\n', 'utf8');

    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'passed', verdict.summary);
  });

  test('a draft cannot pass while a change is active', () => {
    // Draft state is deliberately not an input to the policy: a draft may run the fast checks
    // with an active change, but the closing gate is the same gate for everyone.
    const repo = makeRepo('draft', { changes: ['in-progress'] });

    const asDraft = evaluateArchiveGate(repo, baseConfig, { isPullRequest: true, baseRef: 'origin/x' });

    assert.equal(asDraft.verdict, 'blocked');
  });
});

describe('a disabled policy is never a pass', () => {
  test('enabled: false reports not-configured', () => {
    const repo = makeRepo('disabled');
    const verdict = evaluateArchiveGate(
      repo,
      { openspec: { archiveGate: { enabled: false, scope: 'repository', requireZeroActiveChanges: true } } },
      {}
    );

    assert.equal(verdict.verdict, 'not-configured');
    assert.notEqual(verdict.verdict, 'passed');
    assert.match(verdict.details.join('\n'), /not a pass/i);
  });

  test('requireZeroActiveChanges: false reports not-configured, with the count', () => {
    const repo = makeRepo('not-required', { changes: ['still-open'] });
    const verdict = evaluateArchiveGate(
      repo,
      { openspec: { archiveGate: { enabled: true, scope: 'repository', requireZeroActiveChanges: false } } },
      {}
    );

    assert.equal(verdict.verdict, 'not-configured');
    assert.match(verdict.details.join('\n'), /still-open/);
  });
});

describe('every read failure fails closed', () => {
  test('a missing openspec/config.yaml is a read error', () => {
    const repo = makeRepo('no-config-yaml', { withConfigYaml: false });
    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'read-error');
    assert.notEqual(verdict.verdict, 'passed');
  });

  test('a missing CLI is a read error, not zero changes', () => {
    const repo = makeRepo('no-cli', { withCli: false });
    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'read-error');
    assert.match(verdict.summary + verdict.details.join('\n'), /not installed|npm ci/i);
  });

  test('a CLI that exits non-zero is a read error', () => {
    const repo = makeRepo('cli-fails');
    const bin = path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    fs.writeFileSync(bin, 'process.stderr.write("boom\\n"); process.exit(3);\n', 'utf8');

    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'read-error');
    assert.match(verdict.summary, /exited with code 3/);
  });

  test('unparseable CLI output is a read error', () => {
    const repo = makeRepo('cli-garbage');
    const bin = path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    fs.writeFileSync(bin, 'process.stdout.write("not json at all\\n");\n', 'utf8');

    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'read-error');
    assert.match(verdict.summary, /not valid JSON/);
  });

  test('output without a changes array is a read error', () => {
    // The shape the gate depends on is part of the CLI contract. If a future version changes it,
    // the gate must fail loudly rather than read "no changes" out of an unfamiliar object.
    const repo = makeRepo('cli-wrong-shape');
    const bin = path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    fs.writeFileSync(bin, 'process.stdout.write(JSON.stringify({items: []}));\n', 'utf8');

    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'read-error');
    assert.match(verdict.summary, /no "changes" array/);
  });

  test('output without a root is a read error', () => {
    const repo = makeRepo('cli-no-root');
    const bin = path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    fs.writeFileSync(bin, 'process.stdout.write(JSON.stringify({changes: []}));\n', 'utf8');

    const verdict = evaluateArchiveGate(repo, baseConfig, {});

    assert.equal(verdict.verdict, 'read-error');
    assert.match(verdict.summary, /does not identify an OpenSpec root/);
  });
});

describe('the pull-request scope is the weaker option, and says so', () => {
  test('falls back to repository-wide without a pull-request context', () => {
    const repo = makeRepo('pr-scope-no-context', { changes: ['someone-elses'] });

    const verdict = evaluateArchiveGate(
      repo,
      { openspec: { archiveGate: { enabled: true, scope: 'pull-request', requireZeroActiveChanges: true } } },
      {}
    );

    assert.equal(verdict.verdict, 'blocked', 'must not narrow the scope on a guess');
    assert.match(verdict.details.join('\n'), /fell back to repository-wide/);
  });
});
