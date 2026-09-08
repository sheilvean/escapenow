/**
 * Invocation of the project-local OpenSpec CLI.
 *
 * The CLI is called as `process.execPath <bin/openspec.js> ...` rather than through
 * `npx` or a `.cmd` shim: that form needs no PATH entry, no shell, and behaves the same
 * on Windows, Linux and macOS. The pinned version is read from the lockfile, because the
 * package does not export `./package.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { run } from './proc.mjs';

export const PACKAGE_NAME = '@fission-ai/openspec';
const BIN_RELATIVE = path.join('node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
const PACKAGE_JSON_RELATIVE = path.join(
  'node_modules',
  '@fission-ai',
  'openspec',
  'package.json'
);

/** Distinguishes "cannot read the CLI's answer" from "the answer is zero changes". */
export class OpenSpecReadError extends Error {
  constructor(message, detail = '') {
    super(message);
    this.name = 'OpenSpecReadError';
    this.detail = detail;
  }
}

export function binPath(root) {
  return path.join(root, BIN_RELATIVE);
}

export function isInstalled(root) {
  return fs.existsSync(binPath(root));
}

/** The version pinned in package.json (the declared intent). */
export function pinnedVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.devDependencies?.[PACKAGE_NAME] ?? pkg.dependencies?.[PACKAGE_NAME] ?? null;
  } catch {
    return null;
  }
}

/** The version present in the lockfile (what a clean install would produce). */
export function lockedVersion(root) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    const entry = lock.packages?.[`node_modules/${PACKAGE_NAME}`];
    return entry?.version ?? null;
  } catch {
    return null;
  }
}

/** The version actually installed on disk. */
export function installedVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, PACKAGE_JSON_RELATIVE), 'utf8')).version;
  } catch {
    return null;
  }
}

/** Run the local CLI. Returns the raw process result; the caller interprets it. */
export function cli(root, args, options = {}) {
  const bin = binPath(root);
  if (!fs.existsSync(bin)) {
    throw new OpenSpecReadError(
      `The OpenSpec CLI is not installed at ${BIN_RELATIVE}.`,
      'Run `npm ci` to install the pinned version from the lockfile.'
    );
  }
  return run(process.execPath, [bin, ...args], { cwd: root, ...options });
}

/**
 * Active changes, from `openspec list --json`.
 *
 * Fails closed: a non-zero exit, unparseable output, or a missing `changes` array each
 * raise OpenSpecReadError. None of them is ever reported as an empty change set.
 * `openspec/changes/archive/` is not reported by the CLI as an active change.
 *
 * @returns {{changes: Array<{name: string, completedTasks: number, totalTasks: number,
 *            status: string}>, root: {path: string, source: string}}}
 */
export function listActiveChanges(root) {
  const result = cli(root, ['list', '--json']);

  if (result.spawnError) {
    throw new OpenSpecReadError('Could not start the OpenSpec CLI.', result.spawnError);
  }
  if (result.status !== 0) {
    throw new OpenSpecReadError(
      `openspec list --json exited with code ${result.status}.`,
      (result.stderr || result.stdout).trim()
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    throw new OpenSpecReadError(
      'openspec list --json produced output that is not valid JSON.',
      `${cause.message}\n--- raw output ---\n${result.stdout.slice(0, 2000)}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.changes)) {
    throw new OpenSpecReadError(
      'openspec list --json output has no "changes" array. The CLI contract may have changed.',
      JSON.stringify(parsed).slice(0, 2000)
    );
  }
  if (!parsed.root || typeof parsed.root.path !== 'string') {
    throw new OpenSpecReadError(
      'openspec list --json output does not identify an OpenSpec root.',
      JSON.stringify(parsed).slice(0, 2000)
    );
  }

  return parsed;
}

/** Workflow slash commands the generated Claude Code integration exposes. */
export function installedWorkflows(root) {
  const dir = path.join(root, '.claude', 'commands', 'opsx');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.basename(f, '.md'))
    .sort();
}
