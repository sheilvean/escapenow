#!/usr/bin/env node
/**
 * PostToolUse hook: fast, file-scoped feedback after an edit.
 *
 * Deliberately narrow. It checks only the one file that changed, and only with a check that costs
 * milliseconds. It never builds the solution and never runs a test suite: a hook that did would
 * turn every edit into a multi-second pause, and people would switch it off.
 *
 * Always advisory. It exits 0 in every case and communicates through `systemMessage`, so it cannot
 * block an edit. It also never invokes `tools/repo.mjs`, so it cannot re-enter itself.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const TIMEOUT_MS = 20_000;

/** Emit an advisory message and leave. Exit 0 always: this hook never blocks. */
function advise(message) {
  if (message) {
    process.stdout.write(JSON.stringify({ systemMessage: message }) + '\n');
  }
  process.exit(0);
}

/**
 * Read stdin as JSON, tolerating everything that can go wrong.
 *
 * Malformed JSON, empty input and a missing field are all normal in a hook: it can be invoked by
 * a harness version that sends a different shape. None of them may crash, because an unhandled
 * exception in a hook is noise attached to an unrelated edit.
 */
function readPayload() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return null;
  }

  if (raw.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/**
 * The changed file, resolved and confined to the repository.
 *
 * A path outside the repository is ignored rather than checked: the hook has no business running
 * a tool against a file the session merely happened to touch elsewhere.
 */
function changedFile(payload) {
  const candidate = payload?.tool_input?.file_path;
  if (typeof candidate !== 'string' || candidate.length === 0) return null;

  const root = path.resolve(projectDir());
  const absolute = path.resolve(root, candidate);

  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;

  return { absolute, relative: relative.split(path.sep).join('/') };
}

function run(file, args, cwd) {
  return spawnSync(file, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: TIMEOUT_MS,
    env: { ...process.env, NO_COLOR: '1', DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1' },
  });
}

/** Whitespace and formatting for one C# file. Scoped with --include, so it stays fast. */
function checkCSharp(file, root) {
  const result = run(
    'dotnet',
    ['format', 'whitespace', '--verify-no-changes', '--include', file.relative],
    root
  );

  if (result.error || result.status === null) {
    // A missing SDK or a timeout is not the edit's problem. Stay quiet rather than blaming it.
    return null;
  }
  if (result.status === 0) return null;

  return (
    `${file.relative}: whitespace does not match .editorconfig. ` +
    'Run `node tools/repo.mjs format --write` before the next check.'
  );
}

/** Syntax only, for the tooling's own sources. */
function checkJavaScript(file, root) {
  const result = run(process.execPath, ['--check', file.relative], root);

  if (result.error || result.status === null) return null;
  if (result.status === 0) return null;

  return `${file.relative}: syntax error.\n${(result.stderr || '').trim().split('\n').slice(0, 5).join('\n')}`;
}

/** JSON well-formedness, with the parser's own message — this is where a trailing comma shows up. */
function checkJson(file) {
  try {
    JSON.parse(fs.readFileSync(file.absolute, 'utf8'));
    return null;
  } catch (error) {
    return `${file.relative}: not valid JSON. ${error.message}`;
  }
}

function main() {
  const payload = readPayload();
  const file = changedFile(payload);
  if (!file) advise(null);

  const root = path.resolve(projectDir());
  const extension = path.extname(file.relative).toLowerCase();

  let message = null;
  if (extension === '.cs') {
    message = checkCSharp(file, root);
  } else if (extension === '.mjs' || extension === '.cjs' || extension === '.js') {
    message = checkJavaScript(file, root);
  } else if (extension === '.json') {
    message = checkJson(file);
  }

  advise(message);
}

try {
  main();
} catch {
  // Last resort. A hook that throws attaches a stack trace to an unrelated edit, which is worse
  // than the check silently not happening.
  process.exit(0);
}
