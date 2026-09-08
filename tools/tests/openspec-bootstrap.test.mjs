/**
 * The OpenSpec bootstrap.
 *
 * The template depends on an arrangement upstream does not document: a **project-local** install
 * of a CLI whose installation guide only describes a global one (ADR 0004). If a future release
 * stops supporting that, everything downstream of it — `openspec validate`, the archive gate, the
 * generated Claude Code integration — silently changes behaviour or stops working.
 *
 * These tests pin the arrangement itself: the version that is installed, the shape of the CLI's
 * output that the gate parses, the boundary between CLI-generated and team-maintained files, and
 * whether `/opsx:verify` is present.
 *
 * `verify` is deliberately *reported* rather than asserted. It comes from a machine-wide OpenSpec
 * profile with no per-project override, so a contributor can legitimately not have it — failing
 * their checkout for a setting the template must not change for them would be wrong. The test
 * that matters is that the repository *notices* and says so either way.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  cli,
  installedVersion,
  installedWorkflows,
  isInstalled,
  listActiveChanges,
  lockedVersion,
  OpenSpecReadError,
  PACKAGE_NAME,
  pinnedVersion,
} from '../lib/openspec.mjs';
import { run } from '../lib/proc.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'openspec-bootstrap-tests');

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

describe('the CLI is installed from the lockfile, project-locally', () => {
  test('it is installed, and not by way of a global install', () => {
    assert.ok(
      isInstalled(ROOT),
      'the CLI is missing from node_modules. Run `npm ci`; the template deliberately does not ' +
        'fall back to a global install or to `latest`.'
    );

    // The bin path the tooling uses, which is what makes the invocation shell-free and
    // PATH-independent on every platform.
    const bin = path.join(
      ROOT,
      'node_modules',
      '@fission-ai',
      'openspec',
      'bin',
      'openspec.js'
    );
    assert.ok(fs.existsSync(bin), `expected the CLI entry point at ${bin}`);
  });

  test('the installed version, the lockfile and package.json agree', () => {
    const installed = installedVersion(ROOT);
    const locked = lockedVersion(ROOT);
    const pinned = pinnedVersion(ROOT);

    assert.equal(
      installed,
      locked,
      `installed ${installed}, lockfile ${locked}. Run \`npm ci\` so checks and the archive gate ` +
        'run against the version the repository declares.'
    );
    assert.equal(
      pinned,
      installed,
      `package.json requests ${pinned}, ${installed} is installed. The pin must be exact — no ` +
        'range, and never `latest`.'
    );
  });

  test('the pin is an exact version, not a range', () => {
    const pinned = pinnedVersion(ROOT);

    assert.match(
      pinned,
      /^\d+\.\d+\.\d+(-[\w.]+)?$/,
      `${PACKAGE_NAME} is pinned as "${pinned}". A caret, a tilde or "latest" would let the ` +
        'version the gate reads change without a commit.'
    );
  });

  test('it is a dev dependency, so a published application does not carry it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    assert.ok(
      Object.hasOwn(pkg.devDependencies ?? {}, PACKAGE_NAME),
      `${PACKAGE_NAME} belongs in devDependencies`
    );
    assert.ok(
      !Object.hasOwn(pkg.dependencies ?? {}, PACKAGE_NAME),
      `${PACKAGE_NAME} must not be a runtime dependency`
    );
  });
});

describe('the local CLI is invocable without a shell', () => {
  test('--version answers, and matches what is installed', () => {
    const result = cli(ROOT, ['--version']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), installedVersion(ROOT));
  });

  test('it is invoked through the node executable, not a .cmd shim', () => {
    // The shim is where shell-free spawning of an npm binary breaks on Windows, so the argv shape
    // is part of the contract rather than an implementation detail.
    const result = cli(ROOT, ['--version']);

    assert.equal(result.argv[0], process.execPath);
    assert.match(result.argv[1], /openspec[\\/]bin[\\/]openspec\.js$/);
  });

  test('a non-zero exit surfaces as a read error, not as an empty result', () => {
    const broken = path.join(SCRATCH, 'broken-cli');
    fs.mkdirSync(path.join(broken, 'openspec'), { recursive: true });
    fs.writeFileSync(path.join(broken, 'openspec', 'config.yaml'), 'schema: spec-driven\n', 'utf8');

    const binDir = path.join(broken, 'node_modules', '@fission-ai', 'openspec', 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'openspec.js'), 'process.exit(7);\n', 'utf8');

    assert.throws(() => listActiveChanges(broken), OpenSpecReadError);
  });

  test('a missing install surfaces as a read error naming the fix', () => {
    const empty = path.join(SCRATCH, 'no-install');
    fs.mkdirSync(empty, { recursive: true });

    let error = null;
    try {
      listActiveChanges(empty);
    } catch (thrown) {
      error = thrown;
    }

    assert.ok(error instanceof OpenSpecReadError);
    assert.match(error.detail, /npm ci/);
  });
});

describe('the output shape the archive gate depends on', () => {
  test('list --json returns a changes array and an identified root', () => {
    // If a future release changes this shape, the gate fails closed — which is correct, but this
    // test is what says *why* before anyone starts debugging the gate.
    const listing = listActiveChanges(ROOT);

    assert.ok(Array.isArray(listing.changes), 'expected a `changes` array');
    assert.equal(typeof listing.root?.path, 'string', 'expected `root.path`');

    for (const change of listing.changes) {
      assert.equal(typeof change.name, 'string');
      assert.equal(typeof change.completedTasks, 'number');
      assert.equal(typeof change.totalTasks, 'number');
    }
  });

  test('the archive directory is not reported as an active change', () => {
    const archive = path.join(ROOT, 'openspec', 'changes', 'archive');
    assert.ok(fs.existsSync(archive), 'the archive directory should exist');

    const names = listActiveChanges(ROOT).changes.map((c) => c.name);

    assert.ok(!names.includes('archive'), `the CLI reported the archive directory: ${names}`);
  });

  test('validate --all --strict succeeds, whether or not there is anything to validate', () => {
    // A freshly generated application has no specs and no changes yet, and the CLI then answers
    // "No items found to validate." with exit 0. That is a legitimate state on day one — an
    // assertion demanding a `Totals:` line would fail every new repository for having written no
    // requirements yet. What must hold is the exit code.
    const result = cli(ROOT, ['validate', '--all', '--strict']);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout + result.stderr,
      /Totals:|No items found to validate/,
      'expected either a validation total or an explicit "nothing to validate"'
    );
  });
});

describe('the Claude Code integration is generated and its boundary holds', () => {
  test('the workflow commands and skills are present', () => {
    const workflows = installedWorkflows(ROOT);

    assert.ok(workflows.length > 0, 'no /opsx: commands were generated — run `openspec update`');

    // The four the documented flow depends on. `verify` is handled separately below.
    for (const expected of ['propose', 'apply', 'archive', 'explore']) {
      assert.ok(workflows.includes(expected), `/opsx:${expected} is missing`);
    }

    for (const skill of ['openspec-propose', 'openspec-apply-change', 'openspec-archive-change']) {
      assert.ok(
        fs.existsSync(path.join(ROOT, '.claude', 'skills', skill, 'SKILL.md')),
        `the ${skill} skill is missing`
      );
    }
  });

  test('/opsx:verify is reported either way, and never silently assumed', () => {
    const workflows = installedWorkflows(ROOT);
    const hasVerify = workflows.includes('verify');

    // Whether it is installed depends on a machine-wide profile the template must not change.
    // What must hold is that `doctor` states the situation rather than leaving it unsaid.
    const doctor = run(process.execPath, [path.join(ROOT, 'tools', 'repo.mjs'), 'doctor'], {
      cwd: ROOT,
    });

    assert.match(
      doctor.stdout,
      /\/opsx:verify available/,
      'doctor must report on /opsx:verify whether or not it is installed'
    );

    if (hasVerify) {
      assert.ok(
        fs.existsSync(path.join(ROOT, '.claude', 'skills', 'openspec-verify-change', 'SKILL.md')),
        'the verify command exists but its skill does not — run `openspec update`'
      );
      assert.match(doctor.stdout, /ok\s+\/opsx:verify available/);
    } else {
      // The opt-in instruction has to be there, because the alternative is a contributor
      // wondering why a documented step of the workflow does not exist.
      assert.match(doctor.stdout, /machine-wide OpenSpec profile/);
      assert.match(doctor.stdout, /openspec config profile/);
    }
  });

  test('the CLI owns its own generated files and nothing else', () => {
    // Verified against the pinned version: `openspec update --force` regenerates
    // .claude/commands/opsx/** and .claude/skills/openspec-*/** and leaves everything else alone.
    // That is why the project context is injected into openspec/config.yaml rather than into a
    // file the CLI writes — an upgrade cannot delete it.
    const teamOwned = [
      path.join('openspec', 'config.yaml'),
      path.join('openspec', 'project-context.md'),
      path.join('.claude', 'settings.json'),
      path.join('.claude', 'skills', 'repo-check', 'SKILL.md'),
      path.join('.claude', 'agents', 'code-reviewer.md'),
      path.join('.claude', 'hooks', 'stop-openspec-reminder.mjs'),
      path.join('.claude', 'rules', 'common', 'security.md'),
    ];

    const before = teamOwned.map((relative) => ({
      relative,
      content: fs.readFileSync(path.join(ROOT, relative), 'utf8'),
    }));

    const result = cli(ROOT, ['update', '--force']);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    for (const { relative, content } of before) {
      assert.equal(
        fs.readFileSync(path.join(ROOT, relative), 'utf8'),
        content,
        `openspec update modified ${relative}, which the team owns. The generated/authored ` +
          'boundary in docs/sources-of-truth.md no longer holds.'
      );
    }
  });

  test('the generated commands are addressed as bare openspec, not a global path', () => {
    // The generated instructions tell the agent to run `openspec ...`. That is upstream's wording
    // and it is fine — the repository's own tooling always goes through tools/repo.mjs, which
    // resolves the local binary. This test records the expectation so a future change of wording
    // is noticed rather than discovered when a command fails for a contributor without a global
    // install.
    const propose = fs.readFileSync(
      path.join(ROOT, '.claude', 'commands', 'opsx', 'propose.md'),
      'utf8'
    );

    assert.match(propose, /openspec/, 'the generated command should reference the CLI');
    assert.doesNotMatch(
      propose,
      /npm\s+install\s+-g/,
      'a generated command telling the agent to install globally would contradict ADR 0004'
    );
  });
});

describe('an isolated configuration still resolves the local CLI', () => {
  test('the CLI runs with a home directory that has no OpenSpec configuration', () => {
    // Proves the local install does not depend on the developer's machine-wide state for the
    // read path the gate uses. It cannot prove the same for the *workflow profile*, which is
    // machine-wide by design — see ADR 0004 and the reporting test above.
    const isolatedHome = path.join(SCRATCH, 'isolated-home');
    fs.mkdirSync(isolatedHome, { recursive: true });

    const env = {
      ...process.env,
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      APPDATA: path.join(isolatedHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(isolatedHome, 'AppData', 'Local'),
      XDG_CONFIG_HOME: path.join(isolatedHome, '.config'),
      NO_COLOR: '1',
    };

    const result = run(
      process.execPath,
      [path.join(ROOT, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'), 'list', '--json'],
      { cwd: ROOT, env }
    );

    assert.equal(result.status, 0, result.stderr);

    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed.changes));
  });
});
