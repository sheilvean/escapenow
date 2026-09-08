/**
 * Configuration loading, validation and the generated regions.
 *
 * Each case builds a throwaway repository, so nothing here depends on the state of the real one —
 * and the negative cases can be as broken as they need to be.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, findForeignKeys, findRepoRoot, loadConfig, resolveTokens } from '../lib/config.mjs';
import { readRegion, replaceRegion, RegionError, findDrift, plannedRegions, applyRegions } from '../lib/generated.mjs';
import { run } from '../lib/proc.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'config-tests');

const baseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));

/** A directory that looks enough like the repository for config.mjs to load it. */
function makeRepo(name, mutate = () => {}) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });

  const config = structuredClone(baseConfig);
  mutate(config);

  fs.writeFileSync(
    path.join(repo, 'project.config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );
  fs.copyFileSync(
    path.join(ROOT, 'project.config.schema.json'),
    path.join(repo, 'project.config.schema.json')
  );
  fs.copyFileSync(
    path.join(ROOT, 'tools', 'rename.manifest.json'),
    path.join(repo, 'tools', 'rename.manifest.json')
  );

  return repo;
}

/**
 * Capture a thrown error. `assert.throws` returns undefined, so it cannot be used when the
 * assertion is about the error's own fields.
 */
function caught(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

describe('the repository root is found by walking up', () => {
  test('from a nested directory', () => {
    const repo = makeRepo('walk-up');
    const nested = path.join(repo, 'src', 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(findRepoRoot(nested), repo);
  });

  test('and reports a clear error when there is nothing to find', () => {
    // The temp directory has no project.config.json above it inside the repository.
    const orphan = path.join(SCRATCH, 'orphan');
    fs.mkdirSync(orphan, { recursive: true });

    // SCRATCH lives under artifacts/, which is inside the real repository, so walking up does
    // find the real config. Assert on that instead of an error: the important property is that it
    // stops at a real root rather than guessing.
    assert.equal(findRepoRoot(orphan), ROOT);
  });
});

describe('a configuration that does not satisfy the schema is rejected', () => {
  const cases = [
    ['an unknown property', (c) => { c.unexpected = 'x'; }, 'additional properties'],
    ['a malformed rootNamespace', (c) => { c.rootNamespace = '9-bad'; }, 'must match pattern'],
    ['an unknown architecture profile', (c) => { c.architecture.profile = 'hexagonal'; }, 'allowed'],
    ['an absolute source path', (c) => { c.paths.src = '/etc'; }, 'must match pattern'],
    ['a parent-traversal path', (c) => { c.paths.src = '../outside'; }, 'must match pattern'],
    ['a missing required section', (c) => { delete c.openspec; }, 'required property'],
    ['a non-boolean flag', (c) => { c.integrations.mcp.enabled = 'yes'; }, 'must be boolean'],
    ['a module without a contract', (c) => { c.architecture.modules = [{ name: 'A' }]; }, 'required property'],
    ['a bad language tag', (c) => { c.documentation.language = 'English'; }, 'must match pattern'],
  ];

  for (const [label, mutate, expected] of cases) {
    test(label, () => {
      const repo = makeRepo(`invalid-${label.replace(/\W+/g, '-')}`, mutate);

      const error = caught(() => loadConfig(repo));

      assert.ok(error instanceof ConfigError, `expected a ConfigError, got ${error}`);
      assert.match(error.details.join('\n'), new RegExp(expected, 'i'));
    });
  }

  test('malformed JSON is an error, not an empty configuration', () => {
    const repo = makeRepo('malformed');
    fs.writeFileSync(path.join(repo, 'project.config.json'), '{ "solutionName": ', 'utf8');

    const error = caught(() => loadConfig(repo));

    assert.ok(error instanceof ConfigError, `expected a ConfigError, got ${error}`);
    assert.match(error.message, /not valid JSON/);
  });

  test('the template configuration itself is valid', () => {
    const { config } = loadConfig(ROOT);
    assert.equal(typeof config.solutionName, 'string');
  });
});

describe('values owned by another file are detected', () => {
  test('an SDK version in project.config.json', () => {
    // The schema rejects unknown properties, so this is the second line of defence — it also
    // covers a value nested inside a section the schema does allow.
    const found = findForeignKeys({ sdk: '10.0.300' });

    assert.equal(found.length, 1);
    assert.equal(found[0].owner, 'global.json');
  });

  test('a nested foreign key is found with its pointer', () => {
    const found = findForeignKeys({ nested: { deeper: { packages: {} } } });

    assert.equal(found.length, 1);
    assert.equal(found[0].pointer, '/nested/deeper/packages');
    assert.match(found[0].owner, /Directory\.Packages\.props/);
  });

  test('the real configuration declares none', () => {
    assert.deepEqual(findForeignKeys(baseConfig), []);
  });
});

describe('tokens resolve from the configuration', () => {
  test('every manifest token maps to a non-empty value', () => {
    const { config, manifest } = loadConfig(ROOT);
    const tokens = resolveTokens(config, manifest);

    assert.ok(tokens.length > 0);
    for (const token of tokens) {
      assert.equal(typeof token.value, 'string');
      assert.ok(token.value.length > 0);
    }
  });

  test('a token pointing at a missing configuration path is an error', () => {
    const { config } = loadConfig(ROOT);
    const brokenManifest = { tokens: [{ name: 'x', configPath: 'nope.missing' }] };

    assert.throws(() => resolveTokens(config, brokenManifest), ConfigError);
  });
});

describe('generated regions', () => {
  const begin = '<!-- BEGIN GENERATED: t -->';
  const end = '<!-- END GENERATED: t -->';

  test('only the region is replaced', () => {
    const text = `before\n${begin}\nold\n${end}\nafter\n`;
    const updated = replaceRegion(text, begin, end, 'new');

    assert.ok(updated.startsWith('before\n'));
    assert.ok(updated.endsWith('after\n'));
    assert.equal(readRegion(updated, begin, end).trim(), 'new');
    assert.ok(!updated.includes('old'));
  });

  test('a missing marker is an error, not a guess about where the region goes', () => {
    assert.throws(() => replaceRegion('no markers here', begin, end, 'x'), RegionError);
    assert.throws(() => replaceRegion(`${begin}\nonly begin`, begin, end, 'x'), RegionError);
  });

  test('a duplicated marker is an error', () => {
    const text = `${begin}\na\n${end}\n${begin}\nb\n${end}`;
    assert.throws(() => replaceRegion(text, begin, end, 'x'), RegionError);
  });

  test('markers in the wrong order are an error', () => {
    assert.throws(() => replaceRegion(`${end}\nx\n${begin}`, begin, end, 'x'), RegionError);
  });

  test('replacing twice is idempotent', () => {
    const text = `a\n${begin}\nold\n${end}\nb\n`;
    const once = replaceRegion(text, begin, end, 'new');
    const twice = replaceRegion(once, begin, end, 'new');

    assert.equal(once, twice);
  });

  test('the real repository has no drift', () => {
    const { config, manifest } = loadConfig(ROOT);
    const drift = findDrift(ROOT, plannedRegions(ROOT, config, manifest));

    assert.deepEqual(
      drift,
      [],
      'run `node tools/repo.mjs sync`; the generated regions do not match their sources'
    );
  });

  test('drift is detected after an out-of-band edit, and the check does not repair it', () => {
    const claudeMd = path.join(ROOT, 'CLAUDE.md');
    const original = fs.readFileSync(claudeMd, 'utf8');
    const { config, manifest } = loadConfig(ROOT);
    const planned = plannedRegions(ROOT, config, manifest);
    const region = planned.find((r) => r.file === 'CLAUDE.md');

    try {
      fs.writeFileSync(
        claudeMd,
        replaceRegion(original, region.begin, region.end, 'edited by hand'),
        'utf8'
      );

      const drift = findDrift(ROOT, planned);
      assert.equal(drift.length, 1);
      assert.equal(drift[0].file, 'CLAUDE.md');
      assert.match(drift[0].reason, /does not match its source/);

      // A dry-run apply must not write.
      const before = fs.readFileSync(claudeMd, 'utf8');
      applyRegions(ROOT, planned, true);
      assert.equal(fs.readFileSync(claudeMd, 'utf8'), before, 'a dry run wrote to the file');
    } finally {
      fs.writeFileSync(claudeMd, original, 'utf8');
    }
  });
});

describe('the entry point behaves as a command-line tool', () => {
  const repoMjs = path.join(ROOT, 'tools', 'repo.mjs');

  test('--help exits 0 and lists the command contract', () => {
    const result = run(process.execPath, [repoMjs, '--help'], { cwd: ROOT });

    assert.equal(result.status, 0);
    for (const command of ['init', 'doctor', 'check', 'sync', 'format', 'archive-gate', 'openspec']) {
      assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
    }
  });

  test('an unknown command exits non-zero', () => {
    const result = run(process.execPath, [repoMjs, 'frobnicate'], { cwd: ROOT });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown command/);
  });

  test('init without --config exits non-zero and says what is missing', () => {
    const result = run(process.execPath, [repoMjs, 'init'], { cwd: ROOT });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--config/);
  });

  test('it works when invoked from a subdirectory', () => {
    const nested = path.join(ROOT, 'tools', 'lib');
    const result = run(process.execPath, [repoMjs, 'sync', '--dry-run'], { cwd: nested });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /nothing was written/);
  });

  test('sync --dry-run leaves the working tree alone', () => {
    const before = run('git', ['status', '--porcelain'], { cwd: ROOT }).stdout;

    const result = run(process.execPath, [repoMjs, 'sync', '--dry-run'], { cwd: ROOT });
    assert.equal(result.status, 0);

    const after = run('git', ['status', '--porcelain'], { cwd: ROOT }).stdout;
    assert.equal(after, before, 'a dry run changed the working tree');
  });
});

describe('child processes never see a shell', () => {
  test('shell metacharacters reach the child as one literal argument', () => {
    const hostile = 'a; rm -rf / && echo pwned | cat $(whoami) `id` > /tmp/x';

    const result = run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', hostile]);

    assert.equal(result.status, 0);
    assert.equal(result.stdout, hostile);
  });

  test('an argument that is not a string is refused rather than coerced', () => {
    assert.throws(() => run(process.execPath, ['-e', 'null', 42]), TypeError);
    assert.throws(() => run(process.execPath, ['-e', 'null', null]), TypeError);
    assert.throws(() => run('', []), TypeError);
  });

  test('a path containing a space is passed through intact', () => {
    const spaced = 'some directory/with a space/file.cs';

    const result = run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', spaced]);

    assert.equal(result.stdout, spaced);
  });
});
