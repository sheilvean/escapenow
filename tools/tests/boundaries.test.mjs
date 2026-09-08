/**
 * Two boundaries the specifications state and nothing else asserted.
 *
 * Both were satisfied by construction — every write goes through `path.join(root, ...)`, and no
 * check reads a credential — but "satisfied by construction" is a claim about code someone read
 * once. These make them claims about code that is executed.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { run } from '../lib/proc.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'boundary-tests');

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

/** A snapshot of every path under a directory, with its size and modification time. */
function snapshot(dir) {
  const entries = new Map();

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        entries.set(absolute, 'dir');
        walk(absolute);
      } else {
        const stat = fs.statSync(absolute);
        entries.set(absolute, `${stat.size}:${stat.mtimeMs}`);
      }
    }
  };

  if (fs.existsSync(dir)) walk(dir);
  return entries;
}

function diff(before_, after_) {
  const changes = [];
  for (const [file, state] of after_) {
    if (!before_.has(file)) changes.push(`created ${file}`);
    else if (before_.get(file) !== state) changes.push(`modified ${file}`);
  }
  for (const file of before_.keys()) {
    if (!after_.has(file)) changes.push(`deleted ${file}`);
  }
  return changes;
}

/**
 * A copy of the template that `init` can be run against.
 *
 * node_modules is reused by reference rather than copied: `init` never touches it, and copying
 * 19 MB per case would make this test the slowest thing in the suite for no added confidence.
 */
function copyTemplate(name) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });

  const skip = new Set(['node_modules', 'artifacts', '.git']);
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    fs.cpSync(path.join(ROOT, entry.name), path.join(repo, entry.name), { recursive: true });
  }

  fs.mkdirSync(path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin'), {
    recursive: true,
  });
  const realBin = path.join(ROOT, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
  fs.writeFileSync(
    path.join(repo, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
    `import(${JSON.stringify('file:///' + realBin.replace(/\\/g, '/'))});\n`,
    'utf8'
  );

  return repo;
}

describe('nothing is written outside the repository', () => {
  /**
   * `init` and `sync` run with the home directory redirected at an empty tree, which is then
   * compared byte-for-byte. The specification says the agent configuration is project-scoped and
   * that nothing is installed into the user's home directory; this is what makes that checkable.
   */
  function withRedirectedHome(name, argv) {
    const repo = copyTemplate(name);
    const fakeHome = path.join(SCRATCH, `${name}-home`);

    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, '.claude', 'marker'), 'untouched\n', 'utf8');

    const before_ = snapshot(fakeHome);

    const result = run(process.execPath, [path.join(repo, 'tools', 'repo.mjs'), ...argv], {
      cwd: repo,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        APPDATA: path.join(fakeHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(fakeHome, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(fakeHome, '.config'),
        NO_COLOR: '1',
      },
      timeoutMs: 120_000,
    });

    return { repo, fakeHome, before: before_, result };
  }

  test('init writes only inside the repository', () => {
    const { fakeHome, before: before_, result } = withRedirectedHome('init-scope', [
      'init',
      '--config',
      'project.config.json',
    ]);

    // The exit code is deliberately not asserted. In the template it is 0; in an application
    // generated from the template, `init` correctly *refuses* and exits non-zero — and this test
    // runs in both, because a generated application runs the same tooling tests. Asserting 0 made
    // it fail in every generated repository for doing the right thing. Either way the claim under
    // test is the same one: nothing outside the repository was written.
    const changes = diff(before_, snapshot(fakeHome));
    assert.deepEqual(
      changes,
      [],
      `init touched the home directory (init exited ${result.status}):\n` +
        changes.map((c) => `  ${c}`).join('\n')
    );
  });

  test('sync writes only inside the repository', () => {
    const { fakeHome, before: before_, result } = withRedirectedHome('sync-scope', ['sync']);

    assert.equal(result.status, 0, result.stdout + result.stderr);

    const changes = diff(before_, snapshot(fakeHome));
    assert.deepEqual(changes, [], 'sync touched the home directory:\n' + changes.join('\n'));
  });

  test('doctor writes nothing at all', () => {
    const repo = copyTemplate('doctor-scope');
    const before_ = snapshot(repo);

    const result = run(process.execPath, [path.join(repo, 'tools', 'repo.mjs'), 'doctor'], {
      cwd: repo,
      timeoutMs: 120_000,
    });

    // A read-only command reports; it does not repair. The exit code may be non-zero if it found
    // something, and that is fine — what must hold is that it changed nothing.
    const changes = diff(before_, snapshot(repo)).filter(
      (c) => !c.includes(`${path.sep}artifacts${path.sep}`)
    );

    assert.deepEqual(
      changes,
      [],
      'doctor modified the working tree:\n' + changes.map((c) => `  ${c}`).join('\n')
    );
    assert.match(result.stdout, /Nothing was modified/);
  });

  test('the temporary directory is left alone too', () => {
    // Not because anything should write there, but because a tool that quietly used the temp
    // directory for state would make a "nothing outside the repository" claim false in a way the
    // home-directory check would miss.
    const repo = copyTemplate('temp-scope');
    const marker = path.join(os.tmpdir(), `template-boundary-${process.pid}`);
    fs.mkdirSync(marker, { recursive: true });

    try {
      const before_ = snapshot(marker);

      run(process.execPath, [path.join(repo, 'tools', 'repo.mjs'), 'sync'], {
        cwd: repo,
        timeoutMs: 120_000,
      });

      assert.deepEqual(diff(before_, snapshot(marker)), []);
    } finally {
      fs.rmSync(marker, { recursive: true, force: true });
    }
  });
});

describe('no check needs a credential', () => {
  /**
   * The specification is explicit: building, testing and checking must not require a model API
   * key, a Claude account, or any paid service. The strongest cheap evidence is that nothing in
   * the tooling or the workflows reads a credential-shaped variable at all.
   */
  const CREDENTIAL_VARIABLES = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'OPENAI_API_KEY',
    'GITLEAKS_LICENSE',
    'NPM_TOKEN',
    'NUGET_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AZURE_CLIENT_SECRET',
    'GH_TOKEN',
  ];

  function sourceFiles() {
    return [
      ...fs.globSync('tools/**/*.mjs', { cwd: ROOT }),
      ...fs.globSync('.github/workflows/*.yml', { cwd: ROOT }),
    ]
      .map((p) => p.split(path.sep).join('/'))
      // This file names the variables in order to forbid them.
      .filter((p) => p !== 'tools/tests/boundaries.test.mjs');
  }

  test('the tooling and the workflows read no credential variable', () => {
    const offenders = [];

    for (const relative of sourceFiles()) {
      const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      for (const variable of CREDENTIAL_VARIABLES) {
        if (text.includes(variable)) offenders.push(`${relative} references ${variable}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'a check that needs a credential is a check that cannot run for a new contributor:\n' +
        offenders.map((o) => `  ${o}`).join('\n')
    );
  });

  test('no workflow references a repository secret other than the built-in token', () => {
    for (const relative of fs.globSync('.github/workflows/*.yml', { cwd: ROOT })) {
      const text = fs.readFileSync(path.join(ROOT, relative.split(path.sep).join('/')), 'utf8');

      const secrets = [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)]
        .map((m) => m[1])
        .filter((name) => name !== 'GITHUB_TOKEN');

      assert.deepEqual(
        [...new Set(secrets)],
        [],
        `${relative} references repository secrets, which a fork pull request must never reach`
      );
    }
  });

  test('doctor runs with a stripped environment', () => {
    // An environment with no credentials at all, to prove nothing depends on one being present.
    //
    // The directory is not named after credentials, and the pattern below is phrase-based rather
    // than word-based. The first version did neither: it grepped the whole output for /credential/i
    // while its own scratch directory was called "no-credentials", so `doctor`'s "Repository: ..."
    // line matched and the test failed on its own filename. A broad pattern over a whole output
    // matches the environment, not the behaviour.
    const repo = copyTemplate('stripped-env');

    const result = run(process.execPath, [path.join(repo, 'tools', 'repo.mjs'), 'doctor'], {
      cwd: repo,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot ?? '',
        NO_COLOR: '1',
      },
      timeoutMs: 120_000,
    });

    assert.match(result.stdout, /Repository:/, 'doctor should still produce its report');

    const complaints = (result.stdout + result.stderr)
      .split('\n')
      .filter((line) =>
        /(missing|no|required|set) (an? )?(api[ -]?key|access token|auth token|credential)|not authenticated|please log in/i.test(
          line
        )
      );

    assert.deepEqual(
      complaints,
      [],
      'doctor asked for a credential:\n' + complaints.map((c) => `  ${c.trim()}`).join('\n')
    );
  });
});
