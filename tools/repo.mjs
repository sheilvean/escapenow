#!/usr/bin/env node
/**
 * The repository's single entry point.
 *
 *   node tools/repo.mjs init --config <file> [--dry-run]
 *   node tools/repo.mjs doctor
 *   node tools/repo.mjs check [--ci] [--json]
 *   node tools/repo.mjs sync [--dry-run]
 *   node tools/repo.mjs format [--write]
 *   node tools/repo.mjs archive-gate [--json]
 *   node tools/repo.mjs openspec <args...>
 *
 * Portability: Node builtins only, no shell, no eval. Child processes receive argument vectors,
 * so a path containing a space and a value containing shell metacharacters are both safe. The
 * repository root is found by walking up, so every command works from a subdirectory.
 *
 * Read-only commands never repair. `doctor` reports and exits; `check` validates without
 * modifying a single file. Applying formatting is a separate command on purpose.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ConfigError, findRepoRoot, loadConfig } from './lib/config.mjs';
import { DOTNET, formatArgv, run } from './lib/proc.mjs';
import { InitError, applyInit, looksPreRenamed, planInit } from './lib/init.mjs';
import { applyRegions, plannedRegions, findDrift, RegionError } from './lib/generated.mjs';
import { evaluateArchiveGate } from './lib/gate.mjs';
import { runCheck, STAGE_NAMES } from './lib/check.mjs';
import { validateAgentConfig } from './lib/agentconfig.mjs';
import {
  cli as openspecCli,
  installedVersion,
  installedWorkflows,
  isInstalled,
  lockedVersion,
  pinnedVersion,
} from './lib/openspec.mjs';

const USAGE = `Usage: node tools/repo.mjs <command> [options]

Commands:
  init --config <file> [--dry-run]   First-time initialization. Refuses on an initialized
                                     repository; --dry-run writes nothing and installs nothing.
  doctor                             Report on the repository's state. Never modifies anything.
  check [--ci] [--json]              Run every check: ${STAGE_NAMES.join(', ')}.
  sync [--dry-run]                   Regenerate the derived context regions. Never touches code.
  format [--write]                   Verify formatting, or apply it with --write.
  archive-gate [--json]              Evaluate the archive gate. Fails closed on a read error.
  openspec <args...>                 Run the pinned, project-local OpenSpec CLI.
`;

/** Parse argv into flags and positionals without a dependency and without surprises. */
function parseArgs(argv) {
  const flags = new Map();
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) {
      flags.set(name, inline);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      flags.set(name, argv[++i]);
    } else {
      flags.set(name, true);
    }
  }

  return { flags, positional };
}

const out = (line = '') => process.stdout.write(line + '\n');
const err = (line = '') => process.stderr.write(line + '\n');

function fail(message, details = []) {
  err(`error: ${message}`);
  for (const detail of details) err(`  ${detail}`);
  process.exitCode = 1;
}

// --------------------------------------------------------------------------------------------
// init
// --------------------------------------------------------------------------------------------

function commandInit(flags) {
  const dryRun = flags.get('dry-run') === true;
  const configFlag = flags.get('config');

  if (typeof configFlag !== 'string') {
    fail('init requires --config <file>, naming the configuration to initialize from.');
    return;
  }

  // The flag names the configuration file, so the root is the directory that holds it.
  const configPath = path.resolve(process.cwd(), configFlag);
  if (!fs.existsSync(configPath)) {
    fail(`--config points at ${configPath}, which does not exist.`);
    return;
  }

  const root = path.dirname(configPath);
  const { config, manifest } = loadConfig(root);

  const plan = planInit(root, config, manifest);

  if (plan.alreadyInitialized) {
    err('error: this repository is already initialized.');
    err('  Nothing was changed.');
    err(`  Tokens applied at initialization: ${JSON.stringify(config.template.appliedTokens)}`);
    err('  Renaming an existing application is a manual operation, not a command: it touches');
    err('  namespaces, project files and history. To regenerate only the derived context after a');
    err('  configuration change, run: node tools/repo.mjs sync');
    process.exitCode = 1;
    return;
  }

  out(`${dryRun ? 'Planned' : 'Applying'} initialization in ${root}`);
  out(`  placeholder token: ${plan.placeholder}`);
  for (const token of plan.tokens) {
    out(`  ${token.name} = ${token.value}   (from ${token.configPath})`);
  }
  out();

  if (plan.conflicts.length > 0) {
    err('Conflicts — nothing was changed:');
    for (const conflict of plan.conflicts) err(`  ${conflict}`);
    process.exitCode = 1;
    return;
  }

  if (looksPreRenamed(plan)) {
    out('No placeholder occurrences found. This repository was generated through `dotnet new`,');
    out('where the template engine already applied the substitutions.');
    out('Recording it as initialized and regenerating the derived context.');
    out();
  }

  out(`Content edits (${plan.contentEdits.length} file(s)):`);
  for (const edit of plan.contentEdits) {
    out(`  ${edit.file}  ${edit.occurrences} occurrence(s) -> ${edit.value}`);
  }
  out();
  out(`Renames (${plan.renames.length}):`);
  for (const rename of plan.renames) out(`  ${rename.from} -> ${rename.to}`);
  out();
  out(`Generated regions (${plan.regions.length}):`);
  for (const region of plan.regions) out(`  ${region.file}  (source: ${region.source})`);
  out();

  if (dryRun) {
    out('--dry-run: nothing was written and no dependency was installed.');
    out('Re-run without --dry-run to apply.');
    return;
  }

  try {
    const applied = applyInit(root, config, manifest, plan, { dryRun: false });
    out(
      `Applied: ${applied.contentEdits} file edit(s), ${applied.renames} rename(s), ` +
        `${applied.regions.filter((r) => r.changed).length} region(s) updated.`
    );
    for (const directory of applied.createdDirectories ?? []) {
      out(`  created missing directory: ${directory}`);
    }
    for (const region of applied.regions.filter((r) => r.missing)) {
      err(`  warning: ${region.file} does not exist, so its region was not written.`);
    }
    out();
    out('Next:');
    out('  npm ci');
    out('  dotnet restore');
    out('  node tools/repo.mjs check');
  } catch (error) {
    if (error instanceof InitError) {
      fail(error.message, error.details);
      return;
    }
    throw error;
  }
}

// --------------------------------------------------------------------------------------------
// sync
// --------------------------------------------------------------------------------------------

function commandSync(flags) {
  const dryRun = flags.get('dry-run') === true;
  const root = findRepoRoot(process.cwd());
  const { config, manifest } = loadConfig(root);

  const planned = plannedRegions(root, config, manifest);
  const results = applyRegions(root, planned, dryRun);

  out(`${dryRun ? 'Planned' : 'Applied'} generated regions:`);
  for (const result of results) {
    const state = result.missing ? 'MISSING FILE' : result.changed ? 'updated' : 'already current';
    out(`  ${result.file}: ${state}`);
  }

  out();
  out('sync regenerates derived context only. It does not rename anything, and it does not');
  out('touch openspec/specs/, openspec/changes/ or docs/adr/.');

  if (dryRun) out('--dry-run: nothing was written.');
  if (results.some((r) => r.missing)) process.exitCode = 1;
}

// --------------------------------------------------------------------------------------------
// doctor
// --------------------------------------------------------------------------------------------

function commandDoctor() {
  const root = findRepoRoot(process.cwd());
  const { config, manifest } = loadConfig(root);

  let problems = 0;
  const report = (ok, label, detail) => {
    if (!ok) problems++;
    out(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  out(`Repository: ${root}`);
  out();

  out('Configuration');
  report(true, 'project.config.json satisfies its schema');

  // Being uninitialized is the *template's* correct state, not a fault: the template repository
  // is meant to sit there waiting to be used. Reporting it as a failure made `doctor` red in the
  // one repository that is supposed to look like this, which trains people to ignore the output.
  if (config.template.initialized) {
    report(true, 'initialized', `tokens: ${JSON.stringify(config.template.appliedTokens)}`);
  } else {
    out(
      '  info this repository is not initialized, which is the expected state for the template ' +
        'itself.'
    );
    out('       To turn it into an application: node tools/repo.mjs init --config project.config.json');
  }
  out();

  out('Toolchain');
  const dotnet = run(DOTNET, ['--version'], { cwd: root });
  report(dotnet.status === 0, 'dotnet SDK', dotnet.status === 0 ? dotnet.stdout.trim() : 'not found');
  report(
    process.versions.node.split('.').map(Number)[0] >= 20,
    'Node.js',
    `v${process.versions.node} (OpenSpec requires >= 20.19.0)`
  );
  out();

  out('OpenSpec');
  const installed = installedVersion(root);
  report(
    isInstalled(root),
    'project-local CLI installed',
    installed ? `version ${installed}` : 'run `npm ci`'
  );
  const locked = lockedVersion(root);
  report(
    !installed || !locked || installed === locked,
    'installed version matches the lockfile',
    `installed ${installed ?? '(none)'}, lockfile ${locked ?? '(none)'}, package.json ${pinnedVersion(root) ?? '(none)'}`
  );

  const workflows = installedWorkflows(root);
  report(workflows.length > 0, 'Claude Code integration generated', workflows.join(', ') || 'none');
  report(
    workflows.includes('verify'),
    '/opsx:verify available',
    workflows.includes('verify')
      ? undefined
      : 'the `verify` workflow is not in the machine-wide OpenSpec profile. ' +
        'To opt in: `node tools/repo.mjs openspec config profile` (add `verify`), then ' +
        '`node tools/repo.mjs openspec update`. This changes a setting for every OpenSpec ' +
        'project on this machine, so the template will not do it for you.'
  );
  out();

  out('Generated regions');
  try {
    const drift = findDrift(root, plannedRegions(root, config, manifest));
    if (drift.length === 0) {
      report(true, 'all regions match their source');
    } else {
      for (const { file, reason } of drift) report(false, file, reason);
    }
  } catch (error) {
    report(false, 'generated regions', error.message);
  }
  out();

  out('Agent configuration');
  const findings = validateAgentConfig(root);
  const errors = findings.filter((f) => f.level === 'error');
  if (errors.length === 0) {
    report(true, `${findings.length} finding(s), none blocking`);
  } else {
    for (const finding of errors) report(false, finding.file ?? '.claude', finding.message);
  }
  for (const finding of findings.filter((f) => f.level === 'info')) {
    out(`  info ${finding.file ?? ''} ${finding.message}`);
  }
  out();

  out(
    problems === 0
      ? 'doctor: no problems found. Nothing was modified.'
      : `doctor: ${problems} problem(s) found. Nothing was modified — doctor reports, it does not repair.`
  );

  if (problems > 0) process.exitCode = 1;
}

// --------------------------------------------------------------------------------------------
// check
// --------------------------------------------------------------------------------------------

async function commandCheck(flags) {
  const ci = flags.get('ci') === true;
  const asJson = flags.get('json') === true;

  const root = findRepoRoot(process.cwd());
  const { config, manifest } = loadConfig(root);

  const { results, ok } = await runCheck({ root, config, manifest, ci });

  if (asJson) {
    out(JSON.stringify({ ok, ci, stages: results }, null, 2));
  } else {
    for (const result of results) {
      out(`── ${result.name} [${result.status}] ${result.durationMs}ms`);
      for (const command of result.commands) out(`   $ ${command}`);
      for (const message of result.messages) {
        for (const line of String(message).split('\n')) out(`   ${line}`);
      }
      out();
    }

    const counted = (status) => results.filter((r) => r.status === status).length;
    out(
      `Summary: ${counted('passed')} passed, ${counted('failed')} failed, ` +
        `${counted('not-configured')} not configured, of ${results.length} stage(s).`
    );
    out('A stage reported as "not configured" is not a pass.');
  }

  if (!ok) process.exitCode = 1;
}

// --------------------------------------------------------------------------------------------
// format
// --------------------------------------------------------------------------------------------

function commandFormat(flags) {
  const write = flags.get('write') === true;
  const root = findRepoRoot(process.cwd());
  const { config } = loadConfig(root);

  const args = write
    ? ['format', config.paths.solutionFile]
    : ['format', config.paths.solutionFile, '--verify-no-changes'];

  const result = run(DOTNET, args, { cwd: root });

  out(`$ ${formatArgv(result.argv)}`);
  if (result.stdout.trim()) out(result.stdout.trim());
  if (result.stderr.trim()) err(result.stderr.trim());

  if (!write) {
    out(
      result.status === 0
        ? 'Formatting matches .editorconfig. No file was modified.'
        : 'Formatting differs. No file was modified — re-run with --write to apply.'
    );
  }

  if (result.status !== 0) process.exitCode = 1;
}

// --------------------------------------------------------------------------------------------
// archive-gate
// --------------------------------------------------------------------------------------------

/**
 * CI context from the environment, never from a branch name.
 *
 * GitHub Actions exposes the event and the base ref; a local run has neither, and the gate then
 * reports what it could and could not establish rather than assuming.
 */
function detectCiContext() {
  const event = process.env.GITHUB_EVENT_NAME;
  const isPullRequest = event === 'pull_request' || event === 'pull_request_target';

  return {
    isPullRequest,
    baseRef: isPullRequest && process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : undefined,
    headRef: process.env.GITHUB_HEAD_REF,
  };
}

function commandArchiveGate(flags) {
  const asJson = flags.get('json') === true;
  const root = findRepoRoot(process.cwd());
  const { config } = loadConfig(root);

  const verdict = evaluateArchiveGate(root, config, detectCiContext());

  if (asJson) {
    out(JSON.stringify(verdict, null, 2));
  } else {
    out(`archive-gate: ${verdict.verdict}`);
    out(`  ${verdict.summary}`);
    for (const detail of verdict.details) out(`  ${detail}`);
  }

  // Both a policy block and a read failure are non-zero. A gate that could not read its input
  // must never look like a pass.
  if (verdict.verdict !== 'passed') process.exitCode = 1;
}

// --------------------------------------------------------------------------------------------
// openspec passthrough
// --------------------------------------------------------------------------------------------

function commandOpenSpec(argv) {
  const root = findRepoRoot(process.cwd());
  const result = openspecCli(root, argv, { maxBuffer: 32 * 1024 * 1024 });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  process.exitCode = result.status ?? 1;
}

// --------------------------------------------------------------------------------------------

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    out(USAGE);
    return;
  }

  // The passthrough must not have its own flags eaten by the parser above.
  if (command === 'openspec') {
    commandOpenSpec(rest);
    return;
  }

  const { flags } = parseArgs(rest);

  switch (command) {
    case 'init':
      commandInit(flags);
      break;
    case 'doctor':
      commandDoctor();
      break;
    case 'check':
      await commandCheck(flags);
      break;
    case 'sync':
      commandSync(flags);
      break;
    case 'format':
      commandFormat(flags);
      break;
    case 'archive-gate':
      commandArchiveGate(flags);
      break;
    default:
      fail(`unknown command: ${command}`);
      err(USAGE);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof ConfigError || error instanceof RegionError || error instanceof InitError) {
    fail(error.message, error.details ?? []);
  } else {
    throw error;
  }
}
