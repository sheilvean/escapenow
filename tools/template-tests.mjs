#!/usr/bin/env node
/**
 * Portability proof for the template itself.
 *
 * `node tools/repo.mjs check` proves the base repository is healthy. That is not the same claim as
 * "the generator works". This suite tests the generator: two applications with different names
 * from one set of sources, both building and checking; both start paths; and — the part that
 * matters most — the guardrails actually failing when they should.
 *
 * A guardrail that has only ever been seen passing is not known to work. Every scenario named
 * "fails" below deliberately breaks something and asserts a non-zero exit.
 *
 * Usage:
 *   node tools/template-tests.mjs                 run everything
 *   node tools/template-tests.mjs --verbose       stream child output
 *   node tools/template-tests.mjs --only <name>   one scenario (substring match)
 *   node tools/template-tests.mjs --keep          leave the generated workspaces on disk
 *   node tools/template-tests.mjs --fast          skip the two build-and-check scenarios
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { run, formatArgv } from './lib/proc.mjs';

const TEMPLATE_ROOT = path.resolve(import.meta.dirname, '..');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const KEEP = args.includes('--keep');
const FAST = args.includes('--fast');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// A path with a space, deliberately: it is where tooling that only ever ran on a clean CI path
// breaks, and it costs nothing to make it the default for every workspace.
const WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'template tests '));

const NOT_COPIED = new Set(['node_modules', 'artifacts', '.git', 'bin', 'obj']);

// --------------------------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------------------------

const results = [];
let currentScenario = null;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function detail(message) {
  if (VERBOSE) process.stdout.write(`      ${message}\n`);
}

class AssertionFailed extends Error {}

function assert(condition, message) {
  if (!condition) throw new AssertionFailed(message);
  detail(`ok: ${message}`);
}

/** Scenarios that generate their own workspace, and so need no prerequisite. */
const SELF_CONTAINED = ['dry-run', 'first application', 'second application'];

function needsGeneratedApps(name) {
  return !SELF_CONTAINED.some((prefix) => name.startsWith(prefix));
}

function scenario(name, body) {
  if (ONLY && !name.includes(ONLY)) {
    results.push({ name, status: 'filtered' });
    return;
  }

  currentScenario = name;
  const started = Date.now();
  process.stdout.write(`  ${name} ... `);

  try {
    // Most scenarios build on the two generated applications. With --only, those may have been
    // filtered out; say so rather than failing on a null path, which reads like a product bug.
    if (needsGeneratedApps(name) && (firstApp === null || secondApp === null)) {
      throw new AssertionFailed(
        'this scenario needs the generated applications, which --only filtered out. ' +
          'Run without --only, or use --only with a filter that also matches the two ' +
          '"application" scenarios.'
      );
    }

    body();
    const ms = Date.now() - started;
    process.stdout.write(`PASS (${ms}ms)\n`);
    results.push({ name, status: 'pass', ms });
  } catch (error) {
    const ms = Date.now() - started;
    process.stdout.write(`FAIL (${ms}ms)\n`);
    process.stdout.write(`      ${error.message}\n`);
    if (!(error instanceof AssertionFailed) && error.stack) {
      process.stdout.write(`      ${error.stack.split('\n').slice(1, 4).join('\n      ')}\n`);
    }
    results.push({ name, status: 'fail', ms, message: error.message });
  } finally {
    currentScenario = null;
  }
}

// --------------------------------------------------------------------------------------------
// Workspace helpers
// --------------------------------------------------------------------------------------------

/**
 * Copy the template into a fresh directory.
 *
 * `node_modules` is hard-copied rather than reinstalled: `npm ci` per scenario would add minutes
 * and would test npm, not the template. The lockfile is copied with it, so the CLI version is the
 * pinned one either way.
 */
function copyTemplate(name) {
  const target = path.join(WORKSPACE, name);
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(TEMPLATE_ROOT, { withFileTypes: true })) {
    if (NOT_COPIED.has(entry.name)) continue;
    fs.cpSync(path.join(TEMPLATE_ROOT, entry.name), path.join(target, entry.name), {
      recursive: true,
    });
  }

  fs.cpSync(path.join(TEMPLATE_ROOT, 'node_modules'), path.join(target, 'node_modules'), {
    recursive: true,
  });

  // A fresh application has no change history. The template's own bootstrap change would
  // otherwise block every archive-gate scenario for the wrong reason.
  const changes = path.join(target, 'openspec', 'changes');
  for (const entry of fs.readdirSync(changes, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'archive') {
      fs.rmSync(path.join(changes, entry.name), { recursive: true, force: true });
    }
  }

  // This repository is already an initialized application. The generator suite still has to
  // start from the placeholder token, or `init` correctly refuses and every rename assertion
  // is testing the live name rather than the generator.
  restorePlaceholderState(target);

  // git, so the scenarios that assert "no diff" have something to compare against.
  exec(target, 'git', ['init', '-q', '-b', 'work']);
  exec(target, 'git', ['config', 'user.email', 'template-tests@example.invalid']);
  exec(target, 'git', ['config', 'user.name', 'template tests']);
  exec(target, 'git', ['add', '-A']);
  exec(target, 'git', ['commit', '-q', '-m', 'template as generated']);

  return target;
}

const toPosix = (p) => p.split(path.sep).join('/');

/** Globs written for the placeholder, plus the same globs with the live application name. */
function globsForAppliedName(globs, placeholder, appliedName) {
  const out = [];
  for (const glob of globs) {
    out.push(glob);
    const alt = glob.split(placeholder).join(appliedName);
    if (alt !== glob) out.push(alt);
  }
  return out;
}

function listedFiles(root, globs, excludeGlobs) {
  const excluded = new Set(
    excludeGlobs.flatMap((g) => fs.globSync(g, { cwd: root, withFileTypes: false }).map(toPosix))
  );
  const isExcluded = (relative) =>
    excluded.has(relative) ||
    excludeGlobs.some((g) => {
      const prefix = g.replace(/\/\*\*$/, '');
      return relative === prefix || relative.startsWith(prefix + '/');
    });

  const files = new Set();
  for (const glob of globs) {
    for (const match of fs.globSync(glob, { cwd: root, withFileTypes: false })) {
      const relative = toPosix(match);
      if (isExcluded(relative)) continue;
      const absolute = path.join(root, relative);
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) files.add(relative);
    }
  }
  return [...files].sort();
}

function remapAncestors(relative, movedPrefixes) {
  let result = relative;
  for (const { from, to } of [...movedPrefixes].sort((a, b) => b.from.length - a.from.length)) {
    if (result === from) return to;
    if (result.startsWith(from + '/')) result = to + result.slice(from.length);
  }
  return result;
}

/**
 * Turn an initialized copy back into the placeholder tree `init` expects.
 *
 * Substitutions follow the manifest's globs, not a repository-wide replace — the same boundary
 * `init` itself uses, run in reverse.
 */
function restorePlaceholderState(root) {
  const configPath = path.join(root, 'project.config.json');
  const config = readJson(configPath);
  if (!config.template?.initialized) return;

  const manifest = readJson(path.join(root, 'tools', 'rename.manifest.json'));
  const placeholder = manifest.placeholder.solutionName;
  const solutionName = config.template.appliedTokens?.solutionName;
  const rootNamespace = config.template.appliedTokens?.rootNamespace ?? solutionName;

  if (solutionName && solutionName !== placeholder) {
    const contentGlobs = globsForAppliedName(manifest.contentGlobs, placeholder, solutionName);
    const excludeGlobs = globsForAppliedName(manifest.excludeGlobs, placeholder, solutionName);

    for (const relative of listedFiles(root, contentGlobs, excludeGlobs)) {
      const file = path.join(root, relative);
      const original = fs.readFileSync(file, 'utf8');
      const token = relative.endsWith('.cs') ? rootNamespace : solutionName;
      let updated = original.split(token).join(placeholder);
      if (toPosix(relative).endsWith('packages.lock.json')) {
        updated = updated
          .split(token.toLowerCase())
          .join(placeholder.toLowerCase());
      }
      if (updated !== original) fs.writeFileSync(file, updated, 'utf8');
    }

    const renameGlobs = globsForAppliedName(manifest.renameGlobs, placeholder, solutionName);
    const targets = new Set();
    for (const glob of renameGlobs) {
      for (const match of fs.globSync(glob, { cwd: root, withFileTypes: false })) {
        const relative = toPosix(match);
        if (path.basename(relative).includes(solutionName) || relative.includes(`/${solutionName}`)) {
          targets.add(relative);
        }
      }
    }

    const movedPrefixes = [];
    const ordered = [...targets].sort(
      (a, b) => a.split('/').length - b.split('/').length || a.length - b.length
    );
    for (const relative of ordered) {
      const from = remapAncestors(relative, movedPrefixes);
      const basename = from.split('/').at(-1);
      const newBasename = basename.split(solutionName).join(placeholder);
      if (newBasename === basename) continue;
      const to = [...from.split('/').slice(0, -1), newBasename].join('/');
      const absoluteFrom = path.join(root, from);
      const absoluteTo = path.join(root, to);
      if (!fs.existsSync(absoluteFrom) || fs.existsSync(absoluteTo)) continue;
      fs.renameSync(absoluteFrom, absoluteTo);
      movedPrefixes.push({ from, to });
    }
  }

  const next = readJson(configPath);
  next.template.initialized = false;
  next.template.appliedTokens = {};
  next.solutionName = placeholder;
  next.rootNamespace = placeholder;
  next.paths.solutionFile = `${placeholder}.slnx`;
  writeJson(configPath, next);
}

function exec(cwd, file, argv, { expectFailure = false } = {}) {
  const env = {
    ...process.env,
    NO_COLOR: '1',
    DOTNET_CLI_UI_LANGUAGE: 'en',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  };
  // The suite copies the template into a throwaway git repo. Inheriting the host
  // GITHUB_* context would make archive-gate diff against the pull-request base
  // in a repository that has neither a remote nor that ref.
  delete env.GITHUB_EVENT_NAME;
  delete env.GITHUB_BASE_REF;
  delete env.GITHUB_HEAD_REF;
  delete env.GITHUB_REF;
  delete env.GITHUB_REF_NAME;

  const result = run(file, argv, { cwd, timeoutMs: 20 * 60 * 1000, env });

  if (VERBOSE) {
    detail(`$ ${formatArgv(result.argv)}`);
    const output = (result.stdout + result.stderr).trim();
    if (output) detail(output.split('\n').slice(-12).join('\n      '));
  }

  const failed = result.status !== 0;

  if (expectFailure && !failed) {
    throw new AssertionFailed(
      `Expected \`${formatArgv(result.argv)}\` to fail, but it exited 0. ` +
        'A guardrail that does not fail when it should is not a guardrail.\n      ' +
        (result.stdout + result.stderr).trim().split('\n').slice(-15).join('\n      ')
    );
  }
  if (!expectFailure && failed) {
    throw new AssertionFailed(
      `\`${formatArgv(result.argv)}\` exited ${result.status}.\n      ` +
        (result.stdout + result.stderr).trim().split('\n').slice(-25).join('\n      ')
    );
  }

  return result;
}

const repo = (cwd, argv, options) =>
  exec(cwd, process.execPath, [path.join(cwd, 'tools', 'repo.mjs'), ...argv], options);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function setIdentity(root, solutionName, rootNamespace = solutionName) {
  const file = path.join(root, 'project.config.json');
  const config = readJson(file);
  config.solutionName = solutionName;
  config.rootNamespace = rootNamespace;
  config.paths.solutionFile = `${solutionName}.slnx`;
  writeJson(file, config);
}

/** Files still containing the template's placeholder token, outside where it legitimately lives. */
function placeholderOccurrences(root, placeholder) {
  // Where the placeholder legitimately survives: the template's own declaration of it (tools/,
  // .template.config/) and the records that are not living instructions (docs/adr/, openspec/).
  // docs/ is deliberately NOT allowed wholesale — a generated application's documentation must
  // point at paths that exist.
  const allowed = [
    'tools/',
    '.template.config/',
    'node_modules/',
    '.git/',
    'docs/adr/',
    'openspec/',
  ];
  const found = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');

      if (NOT_COPIED.has(entry.name)) continue;
      if (allowed.some((prefix) => relative.startsWith(prefix))) continue;

      if (entry.isDirectory()) {
        if (relative.includes(placeholder)) found.push(`${relative} (directory name)`);
        walk(absolute);
        continue;
      }

      if (entry.name.includes(placeholder)) found.push(`${relative} (file name)`);

      if (/\.(cs|csproj|slnx|json|props|md|yml|yaml)$/.test(entry.name)) {
        const text = fs.readFileSync(absolute, 'utf8');
        if (text.includes(placeholder)) found.push(`${relative} (contents)`);
      }
    }
  };

  walk(root);
  return found;
}

function gitStatus(root) {
  return exec(root, 'git', ['status', '--porcelain']).stdout.trim();
}

// --------------------------------------------------------------------------------------------
// Scenarios
// --------------------------------------------------------------------------------------------

log(`Workspace: ${WORKSPACE}`);
log(`(the path contains a space on purpose)\n`);

const placeholder = readJson(path.join(TEMPLATE_ROOT, 'tools', 'rename.manifest.json')).placeholder
  .solutionName;

let firstApp = null;
let secondApp = null;

log('Generation');

scenario('dry-run writes nothing and installs nothing', () => {
  const root = copyTemplate('dry-run-app');
  setIdentity(root, 'DryRunApp');

  // Commit the identity edit so the assertion below is about what init did, not about that edit.
  exec(root, 'git', ['add', '-A']);
  exec(root, 'git', ['commit', '-q', '-m', 'identity']);

  const result = repo(root, ['init', '--config', 'project.config.json', '--dry-run']);

  assert(result.stdout.includes('--dry-run'), 'the output states that nothing was written');
  assert(result.stdout.includes('Content edits'), 'the plan lists the content edits');
  assert(result.stdout.includes('Renames'), 'the plan lists the renames');
  assert(gitStatus(root) === '', 'git reports no modification after a dry run');
  assert(
    readJson(path.join(root, 'project.config.json')).template.initialized === false,
    'a dry run does not mark the repository initialized'
  );
});

scenario('first application: rename applies to the declared file set only', () => {
  firstApp = copyTemplate('first');
  setIdentity(firstApp, 'AcmeOrders', 'AcmeOrders');

  repo(firstApp, ['init', '--config', 'project.config.json']);

  assert(
    fs.existsSync(path.join(firstApp, 'AcmeOrders.slnx')),
    'the solution file was renamed'
  );
  assert(
    fs.existsSync(path.join(firstApp, 'src', 'AcmeOrders.Domain', 'AcmeOrders.Domain.csproj')),
    'project directories and files were renamed'
  );
  assert(
    fs
      .readFileSync(
        path.join(firstApp, 'src', 'AcmeOrders.Domain', 'Readiness', 'ReadinessVerdict.cs'),
        'utf8'
      )
      .includes('namespace AcmeOrders.Domain.Readiness;'),
    'namespaces in C# sources were rewritten'
  );

  const leftovers = placeholderOccurrences(firstApp, placeholder);
  assert(
    leftovers.length === 0,
    `no occurrence of the placeholder "${placeholder}" remains: ${leftovers.join(', ')}`
  );

  assert(
    fs.readFileSync(path.join(firstApp, 'src', 'AcmeOrders.Application', 'packages.lock.json'), 'utf8')
      .includes('"acmeorders.domain"'),
    'NuGet lock files record the new project id in lowercase, so CI locked restore can succeed'
  );

  const config = readJson(path.join(firstApp, 'project.config.json'));
  assert(config.template.initialized === true, 'the repository is marked initialized');
  assert(
    config.template.appliedTokens.solutionName === 'AcmeOrders',
    'the applied tokens were recorded'
  );
});

scenario('second application: a different name and a different namespace', () => {
  secondApp = copyTemplate('second one');
  setIdentity(secondApp, 'Beta', 'Contoso.Beta');

  // Namespaces follow rootNamespace, so an explicit RootNamespace is required when the two
  // differ. The config check enforces that; declare it the way the docs prescribe.
  const props = path.join(secondApp, 'Directory.Build.props');
  const text = fs.readFileSync(props, 'utf8');
  fs.writeFileSync(
    props,
    text.replace(
      '  <PropertyGroup Label="Warning policy">',
      '  <PropertyGroup>\n' +
        "    <RootNamespace>$(MSBuildProjectName.Replace('Beta','Contoso.Beta'))</RootNamespace>\n" +
        '  </PropertyGroup>\n\n' +
        '  <PropertyGroup Label="Warning policy">'
    ),
    'utf8'
  );

  repo(secondApp, ['init', '--config', 'project.config.json']);

  assert(fs.existsSync(path.join(secondApp, 'Beta.slnx')), 'the solution file was renamed');
  assert(
    fs.existsSync(path.join(secondApp, 'src', 'Beta.Domain', 'Beta.Domain.csproj')),
    'project names follow solutionName'
  );
  assert(
    fs
      .readFileSync(path.join(secondApp, 'src', 'Beta.Domain', 'Readiness', 'ReadinessVerdict.cs'), 'utf8')
      .includes('namespace Contoso.Beta.Domain.Readiness;'),
    'namespaces follow rootNamespace, independently of solutionName'
  );

  const leftovers = placeholderOccurrences(secondApp, placeholder);
  assert(leftovers.length === 0, `no placeholder remains: ${leftovers.join(', ')}`);

  assert(
    !fs.existsSync(path.join(secondApp, 'src', 'AcmeOrders.Domain')),
    'the second application carries nothing from the first'
  );
});

scenario('hidden directories survive generation', () => {
  // A classic template bug: dot-directories dropped by the copy or by the template engine, so the
  // generated application silently has no agent context and no CI.
  for (const app of [firstApp, secondApp]) {
    for (const hidden of ['.claude', '.github', '.editorconfig', '.gitignore', '.mcp.json']) {
      assert(fs.existsSync(path.join(app, hidden)), `${path.basename(app)}: ${hidden} is present`);
    }
    for (const nested of [
      '.claude/settings.json',
      '.claude/rules/common/security.md',
      '.claude/skills/repo-check/SKILL.md',
      '.claude/agents/code-reviewer.md',
      '.claude/hooks/stop-openspec-reminder.mjs',
      '.claude/commands/opsx/verify.md',
      '.github/workflows/pr.yml',
    ]) {
      assert(fs.existsSync(path.join(app, nested)), `${path.basename(app)}: ${nested} is present`);
    }
  }

  // .config/ is not shipped: the template has no local dotnet tools. Reported as not applicable
  // rather than asserted, so this stays honest if one is added later.
  const hasConfigDir = fs.existsSync(path.join(firstApp, '.config'));
  detail(`.config/: ${hasConfigDir ? 'present' : 'not shipped (no local dotnet tools) — not applicable'}`);
});

scenario('re-running init produces no diff and refuses', () => {
  const before = gitStatus(firstApp);
  exec(firstApp, 'git', ['add', '-A']);
  exec(firstApp, 'git', ['commit', '-q', '-m', 'initialized']);

  const result = repo(firstApp, ['init', '--config', 'project.config.json'], {
    expectFailure: true,
  });

  assert(
    result.stderr.includes('already initialized'),
    'the refusal says the repository is already initialized'
  );
  assert(result.stderr.includes('Nothing was changed'), 'the refusal states nothing changed');
  assert(gitStatus(firstApp) === '', 'no file was modified by the refused init');
  detail(`(state before the commit: ${before ? 'dirty from init, as expected' : 'clean'})`);
});

scenario('renaming after initialization is refused, not silently applied', () => {
  setIdentity(firstApp, 'RenamedAgain');

  const result = repo(firstApp, ['init', '--config', 'project.config.json'], {
    expectFailure: true,
  });

  assert(result.stderr.includes('manual operation'), 'the refusal explains why');
  assert(
    fs.existsSync(path.join(firstApp, 'src', 'AcmeOrders.Domain')),
    'no source file was renamed'
  );

  // Restore the identity for the scenarios that follow.
  setIdentity(firstApp, 'AcmeOrders');
  exec(firstApp, 'git', ['checkout', '--', 'project.config.json']);
});

log('\nConfiguration and generated context');

scenario('a configuration change updates only generated context', () => {
  const authored = path.join(firstApp, 'openspec', 'specs', 'example-capability');
  fs.mkdirSync(authored, { recursive: true });
  const authoredSpec = path.join(authored, 'spec.md');
  // A valid spec, so the `specs` check stage in the later build scenario has nothing to complain
  // about. An invalid one would fail that stage for the test's reasons rather than the template's.
  const authoredContent = [
    '## Purpose',
    '',
    'A hand-written specification that must survive `sync` byte-for-byte.',
    '',
    '## Requirements',
    '',
    '### Requirement: Authored files are never overwritten',
    'The tooling SHALL NOT modify a specification authored by a person.',
    '',
    '#### Scenario: sync leaves an authored spec untouched',
    '- **WHEN** `node tools/repo.mjs sync` runs',
    '- **THEN** this file is byte-identical afterwards',
    '',
  ].join('\n');
  fs.writeFileSync(authoredSpec, authoredContent, 'utf8');

  const adr = path.join(firstApp, 'docs', 'adr', '0099-local-decision.md');
  fs.writeFileSync(adr, '# 0099. A local decision\n\nStatus: accepted\n', 'utf8');

  exec(firstApp, 'git', ['add', '-A']);
  exec(firstApp, 'git', ['commit', '-q', '-m', 'authored files']);

  // Change something that is not the identity.
  const configFile = path.join(firstApp, 'project.config.json');
  const config = readJson(configFile);
  config.documentation.language = 'pl';
  writeJson(configFile, config);

  repo(firstApp, ['sync']);

  assert(
    fs.readFileSync(path.join(firstApp, 'CLAUDE.md'), 'utf8').includes('`pl`'),
    'the CLAUDE.md region picked up the new language'
  );
  assert(
    fs.readFileSync(authoredSpec, 'utf8') === authoredContent,
    'the authored specification is byte-identical'
  );
  assert(fs.existsSync(adr), 'the authored ADR still exists');

  const changed = exec(firstApp, 'git', ['diff', '--name-only']).stdout.trim().split('\n').filter(Boolean);
  const unexpected = changed.filter(
    (f) => !['project.config.json', 'CLAUDE.md', 'openspec/config.yaml'].includes(f)
  );
  assert(
    unexpected.length === 0,
    `sync touched only generated regions; unexpected: ${unexpected.join(', ') || '(none)'}`
  );

  // Put it back so the later check scenarios run against the documented configuration.
  config.documentation.language = 'en';
  writeJson(configFile, config);
  repo(firstApp, ['sync']);
});

scenario('generated-region drift fails the check', () => {
  const claudeMd = path.join(firstApp, 'CLAUDE.md');
  const original = fs.readFileSync(claudeMd, 'utf8');

  // Edit inside the generated region, which is what a well-meaning hand edit looks like.
  fs.writeFileSync(
    claudeMd,
    original.replace('- Architecture profile:', '- Architecture profile (edited by hand):'),
    'utf8'
  );

  try {
    const result = repo(firstApp, ['doctor'], { expectFailure: true });
    assert(result.stdout.includes('CLAUDE.md'), 'doctor names the drifted file');
    assert(gitStatus(firstApp).includes('CLAUDE.md'), 'doctor did not repair the drift');
  } finally {
    fs.writeFileSync(claudeMd, original, 'utf8');
  }
});

log('\nGuardrails: each must fail when it should');

scenario('a reversed layer reference cannot pass the checks', () => {
  const domainProject = path.join(firstApp, 'src', 'AcmeOrders.Domain', 'AcmeOrders.Domain.csproj');
  const original = fs.readFileSync(domainProject, 'utf8');

  // Domain referencing Infrastructure: the wrong direction.
  //
  // Worth recording, because it changes what this scenario can claim: in a strictly layered
  // solution every forbidden edge is the *reverse* of an edge that already exists, so it is a
  // project cycle — and MSBuild rejects it at restore time with MSB4006 before any architecture
  // test runs. The check still fails, which is the property that matters here; the architecture
  // tests are not what catches this particular shape.
  //
  // The project-graph rule earns its keep on the edge MSBuild cannot see: a forbidden reference
  // that is not a reversal, so the graph stays acyclic and the compiler emits nothing. That is
  // exactly the fixture pair `Fixtures.Layers.Domain -> Fixtures.Layers.Infrastructure` (the
  // fixture infrastructure has no reference back), asserted by
  // NegativeFixtureTests.The_project_reference_rule_detects_the_forbidden_edge_the_fixture_declares
  // and kept honest by the "weakened architecture rule" scenario above.
  fs.writeFileSync(
    domainProject,
    original.replace(
      '</Project>',
      '  <ItemGroup>\n' +
        '    <ProjectReference Include="../AcmeOrders.Infrastructure/AcmeOrders.Infrastructure.csproj" />\n' +
        '  </ItemGroup>\n\n' +
        '</Project>'
    ),
    'utf8'
  );

  try {
    const result = exec(
      firstApp,
      'dotnet',
      ['test', path.join('tests', 'AcmeOrders.ArchitectureTests', 'AcmeOrders.ArchitectureTests.csproj')],
      { expectFailure: true }
    );

    assert(
      /circular dependency|MSB4006/i.test(result.stdout + result.stderr),
      'the reversed reference is rejected as a project cycle, before the tests could run'
    );
  } finally {
    fs.writeFileSync(domainProject, original, 'utf8');
  }

  // And the negative test that proves the graph rule itself detects an acyclic forbidden edge is
  // present, so this scenario is not the only thing standing behind that claim.
  const negativeTests = fs.readFileSync(
    path.join(firstApp, 'tests', 'AcmeOrders.ArchitectureTests', 'NegativeFixtureTests.cs'),
    'utf8'
  );
  assert(
    negativeTests.includes('The_project_reference_rule_detects_the_forbidden_edge_the_fixture_declares'),
    'the acyclic forbidden-edge case is covered by a negative fixture test'
  );
});

scenario('a weakened architecture rule fails its negative test', () => {
  const profile = path.join(
    firstApp,
    'tests',
    'AcmeOrders.ArchitectureTests',
    'Support',
    'LayeredProfile.cs'
  );
  const original = fs.readFileSync(profile, 'utf8');

  // Remove the web-framework entry from the Domain deny list — the classic way to make a red
  // architecture test green without fixing anything.
  const weakened = original.replace(
    /\s*\("\^Microsoft\\\\\.AspNetCore\\\\\..\*",\s*"Domain must not depend on the web framework\."\),/,
    ''
  );
  assert(weakened !== original, 'the weakening edit applied (the rule list shape is unchanged)');

  fs.writeFileSync(profile, weakened, 'utf8');

  try {
    exec(
      firstApp,
      'dotnet',
      ['test', path.join('tests', 'AcmeOrders.ArchitectureTests', 'AcmeOrders.ArchitectureTests.csproj')],
      { expectFailure: true }
    );
  } finally {
    fs.writeFileSync(profile, original, 'utf8');
  }
});

scenario('a deleted required config fails the check rather than skipping it', () => {
  const target = path.join(firstApp, 'Directory.Packages.props');
  const original = fs.readFileSync(target, 'utf8');
  fs.rmSync(target);

  try {
    const result = repo(firstApp, ['check'], { expectFailure: true });
    assert(
      result.stdout.includes('MISSING required file: Directory.Packages.props'),
      'the config stage names the missing file'
    );
    assert(
      !/config \[not-configured\]/.test(result.stdout),
      'a missing required file is a failure, not "not configured"'
    );
  } finally {
    fs.writeFileSync(target, original, 'utf8');
  }
});

scenario('a deleted test project fails its stage rather than skipping it', () => {
  const project = path.join(firstApp, 'tests', 'AcmeOrders.UnitTests');
  const backup = path.join(WORKSPACE, 'unit-tests-backup');
  fs.cpSync(project, backup, { recursive: true });
  fs.rmSync(project, { recursive: true, force: true });

  try {
    const result = repo(firstApp, ['check'], { expectFailure: true });
    assert(
      /test:unit \[failed\]/.test(result.stdout),
      'the unit test stage failed rather than reporting not-configured'
    );
    assert(
      result.stdout.includes('cannot be skipped into a pass'),
      'the message says a required stage cannot be skipped into a pass'
    );
  } finally {
    fs.cpSync(backup, project, { recursive: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

scenario('an over-permissive agent setting fails the check', () => {
  const settings = path.join(firstApp, '.claude', 'settings.json');
  const original = fs.readFileSync(settings, 'utf8');
  const parsed = JSON.parse(original);

  parsed.permissions.defaultMode = 'bypassPermissions';
  parsed.permissions.allow.push('Bash(*)');
  parsed.enableAllProjectMcpServers = true;
  fs.writeFileSync(settings, JSON.stringify(parsed, null, 2), 'utf8');

  try {
    const result = repo(firstApp, ['doctor'], { expectFailure: true });
    const output = result.stdout + result.stderr;
    assert(output.includes('bypassPermissions'), 'the bypass mode is reported');
    assert(output.includes('blanket rule'), 'the blanket allow rule is reported');
    assert(output.includes('enableAllProjectMcpServers'), 'trusting all MCP servers is reported');
  } finally {
    fs.writeFileSync(settings, original, 'utf8');
  }
});

scenario('a missing hook script fails the check', () => {
  const hook = path.join(firstApp, '.claude', 'hooks', 'stop-openspec-reminder.mjs');
  const original = fs.readFileSync(hook, 'utf8');
  fs.rmSync(hook);

  try {
    const result = repo(firstApp, ['doctor'], { expectFailure: true });
    assert(
      (result.stdout + result.stderr).includes('stop-openspec-reminder.mjs'),
      'the missing hook script is named'
    );
  } finally {
    fs.writeFileSync(hook, original, 'utf8');
  }
});

log('\nArchive gate');

scenario('an active change blocks the gate; archiving unblocks it', () => {
  const gateBefore = repo(firstApp, ['archive-gate']);
  assert(gateBefore.stdout.includes('archive-gate: passed'), 'the gate starts clean');

  // A real change, created through the pinned CLI rather than by hand.
  repo(firstApp, ['openspec', 'new', 'change', 'add-a-thing', '--description', 'A test change']);

  const blocked = repo(firstApp, ['archive-gate'], { expectFailure: true });
  assert(blocked.stdout.includes('archive-gate: blocked'), 'an active change blocks the gate');
  assert(blocked.stdout.includes('add-a-thing'), 'the gate names the active change');

  // Archive it the way a person would: move it under archive/.
  const from = path.join(firstApp, 'openspec', 'changes', 'add-a-thing');
  const to = path.join(firstApp, 'openspec', 'changes', 'archive', 'add-a-thing');
  fs.renameSync(from, to);

  const passed = repo(firstApp, ['archive-gate']);
  assert(passed.stdout.includes('archive-gate: passed'), 'the gate passes once the change is archived');

  fs.rmSync(to, { recursive: true, force: true });
});

scenario('the archive directory is not counted as an active change', () => {
  const archived = path.join(firstApp, 'openspec', 'changes', 'archive', 'an-old-change');
  fs.mkdirSync(archived, { recursive: true });
  fs.writeFileSync(path.join(archived, 'proposal.md'), '## Why\n\nDone long ago.\n', 'utf8');

  try {
    const result = repo(firstApp, ['archive-gate']);
    assert(result.stdout.includes('archive-gate: passed'), 'archived changes do not block the gate');
  } finally {
    fs.rmSync(archived, { recursive: true, force: true });
  }
});

scenario('a corrupted OpenSpec root makes the gate report a read error', () => {
  const configYaml = path.join(firstApp, 'openspec', 'config.yaml');
  const original = fs.readFileSync(configYaml, 'utf8');
  fs.rmSync(configYaml);

  try {
    const result = repo(firstApp, ['archive-gate'], { expectFailure: true });
    assert(
      result.stdout.includes('archive-gate: read-error'),
      'the gate reports a read error rather than zero changes'
    );
    assert(
      !result.stdout.includes('archive-gate: passed'),
      'a read failure is never reported as a pass'
    );
  } finally {
    fs.writeFileSync(configYaml, original, 'utf8');
  }
});

scenario('a broken CLI makes the gate report a read error', () => {
  const bin = path.join(firstApp, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
  const original = fs.readFileSync(bin, 'utf8');
  fs.writeFileSync(bin, 'process.stdout.write("not json"); process.exit(0);\n', 'utf8');

  try {
    const result = repo(firstApp, ['archive-gate'], { expectFailure: true });
    assert(result.stdout.includes('read-error'), 'unparseable CLI output is a read error');
    assert(result.stdout.includes('not valid JSON'), 'the reason is specific');
  } finally {
    fs.writeFileSync(bin, original, 'utf8');
  }
});

log('\nModules');

scenario('a registered module fixture is covered without editing a test', () => {
  const moduleName = 'Scheduling';
  const projectDir = path.join(firstApp, 'src', `AcmeOrders.Modules.${moduleName}`);
  fs.mkdirSync(path.join(projectDir, 'Contracts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'Internal'), { recursive: true });

  fs.writeFileSync(
    path.join(projectDir, `AcmeOrders.Modules.${moduleName}.csproj`),
    '<Project Sdk="Microsoft.NET.Sdk">\n</Project>\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(projectDir, 'Contracts', 'ISchedulingService.cs'),
    `namespace AcmeOrders.Modules.${moduleName}.Contracts;\n\npublic interface ISchedulingService\n{\n    string Run();\n}\n`,
    'utf8'
  );

  const architectureTests = path.join(
    firstApp,
    'tests',
    'AcmeOrders.ArchitectureTests',
    'AcmeOrders.ArchitectureTests.csproj'
  );
  const testsBefore = fs.readFileSync(architectureTests, 'utf8');

  const configFile = path.join(firstApp, 'project.config.json');
  const config = readJson(configFile);

  try {
    // Step 1: the project exists but is not registered. The registry check must catch it — this
    // is the direction that matters, because an unregistered module is outside every rule.
    exec(firstApp, 'dotnet', ['sln', 'AcmeOrders.slnx', 'add', path.join('src', `AcmeOrders.Modules.${moduleName}`, `AcmeOrders.Modules.${moduleName}.csproj`)]);

    const unregistered = exec(
      firstApp,
      'dotnet',
      ['test', path.join('tests', 'AcmeOrders.ArchitectureTests', 'AcmeOrders.ArchitectureTests.csproj')],
      { expectFailure: true }
    );
    assert(
      (unregistered.stdout + unregistered.stderr).includes(moduleName),
      'an unregistered module project fails the registry check by name'
    );

    // Step 2: register it. The tests must now pass with no test file edited.
    config.architecture.modules = [{ name: moduleName, contract: 'Contracts' }];
    writeJson(configFile, config);

    exec(firstApp, 'dotnet', [
      'test',
      path.join('tests', 'AcmeOrders.ArchitectureTests', 'AcmeOrders.ArchitectureTests.csproj'),
    ]);

    assert(
      fs.readFileSync(architectureTests, 'utf8') === testsBefore,
      'no architecture test project file was edited to cover the new module'
    );
  } finally {
    config.architecture.modules = [];
    writeJson(configFile, config);
    exec(firstApp, 'dotnet', ['sln', 'AcmeOrders.slnx', 'remove', path.join('src', `AcmeOrders.Modules.${moduleName}`, `AcmeOrders.Modules.${moduleName}.csproj`)]);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

log('\nOpenSpec integration');

scenario('the integration is present and exposes the workflows', () => {
  for (const app of [firstApp, secondApp]) {
    const commands = fs.readdirSync(path.join(app, '.claude', 'commands', 'opsx'));
    for (const expected of ['propose.md', 'apply.md', 'archive.md', 'explore.md']) {
      assert(commands.includes(expected), `${path.basename(app)}: /opsx:${expected.replace('.md', '')}`);
    }

    // verify is reported, never assumed: it comes from the machine-wide OpenSpec profile, so a
    // contributor can legitimately not have it.
    const hasVerify = commands.includes('verify.md');
    detail(
      `${path.basename(app)}: /opsx:verify ${hasVerify ? 'available' : 'NOT available — machine-wide profile lacks `verify`'}`
    );

    const doctor = run(process.execPath, [path.join(app, 'tools', 'repo.mjs'), 'doctor'], {
      cwd: app,
    });
    const reportsVerify = doctor.stdout.includes('/opsx:verify available');
    assert(reportsVerify, `${path.basename(app)}: doctor reports on /opsx:verify either way`);
  }
});

scenario('openspec update leaves the team-maintained config untouched', () => {
  const configYaml = path.join(firstApp, 'openspec', 'config.yaml');
  const before = fs.readFileSync(configYaml, 'utf8');

  repo(firstApp, ['openspec', 'update', '--force']);

  assert(
    fs.readFileSync(configYaml, 'utf8') === before,
    'openspec/config.yaml is byte-identical after openspec update'
  );
  assert(
    fs.existsSync(path.join(firstApp, '.claude', 'skills', 'repo-check', 'SKILL.md')),
    'the team-maintained skills survive openspec update'
  );
  assert(
    fs.existsSync(path.join(firstApp, '.claude', 'settings.json')),
    'the team-maintained settings survive openspec update'
  );
});

log('\nBuild and check both applications');

if (FAST) {
  log('  (skipped: --fast)');
  results.push({ name: 'both applications restore, build and check', status: 'filtered' });
} else {
  scenario('both applications restore, build and check', () => {
    for (const app of [firstApp, secondApp]) {
      const name = path.basename(app);
      detail(`--- ${name} ---`);

      exec(app, 'dotnet', ['restore']);
      repo(app, ['check']);
    }
  });
}

// --------------------------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------------------------

const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.filter((r) => r.status === 'fail');
const filtered = results.filter((r) => r.status === 'filtered').length;

log('');
log('='.repeat(78));
log(`Template tests: ${passed} passed, ${failed.length} failed, ${filtered} not run.`);

if (failed.length > 0) {
  log('');
  for (const failure of failed) {
    log(`FAILED  ${failure.name}`);
    log(`        ${failure.message.split('\n')[0]}`);
  }
}

if (filtered > 0) {
  log('');
  log('Scenarios that did not run are reported as "not run", never as passed.');
}

if (KEEP) {
  log('');
  log(`Workspace kept at: ${WORKSPACE}`);
} else {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
}

process.exit(failed.length > 0 ? 1 : 0);
