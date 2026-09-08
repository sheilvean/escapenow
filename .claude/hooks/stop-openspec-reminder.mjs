#!/usr/bin/env node
/**
 * Stop hook: remind that an OpenSpec change is still open.
 *
 * What it does: prints one reminder per session when an active change exists.
 *
 * What it deliberately does not do:
 *   - archive anything, or run any OpenSpec command that writes;
 *   - approve a change on a human's behalf;
 *   - block the session. It exits 0 always and never sets `decision: "stop"`, so it cannot hold a
 *     session open — a Stop hook that blocks is a Stop hook people disable;
 *   - repeat itself. Once per session, tracked in git-ignored state;
 *   - push toward closing a change that is still being worked on. The message says what is open,
 *     not what to do about it.
 *
 * `stop_hook_active` is honoured: when the harness reports it is already inside a stop-hook cycle,
 * this exits silently rather than adding to it.
 *
 * CI enforces the policy. This is a reminder, and reminders should be cheap and easy to ignore.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const TIMEOUT_MS = 10_000;

/** Exit 0 always. The optional message is advisory. */
function finish(message) {
  if (message) {
    process.stdout.write(JSON.stringify({ systemMessage: message }) + '\n');
  }
  process.exit(0);
}

function readPayload() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Malformed input must not crash the hook or block the session.
    return {};
  }
}

function projectDir() {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

/**
 * Session-scoped marker, so the reminder appears once.
 *
 * Lives under .claude/state/, which .gitignore excludes: it is session data, not configuration.
 * A session id that is missing or oddly shaped is reduced to a safe file name rather than trusted.
 */
function alreadyRemindedThisSession(root, sessionId) {
  const safe = String(sessionId ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'unknown';
  const dir = path.join(root, '.claude', 'state');
  const marker = path.join(dir, `stop-reminder-${safe}`);

  try {
    if (fs.existsSync(marker)) return true;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
    return false;
  } catch {
    // If the marker cannot be written, prefer reminding once more over failing.
    return false;
  }
}

/**
 * Active changes, read through the pinned project-local CLI.
 *
 * Returns null when the answer cannot be read. The hook then says nothing: a reminder is not the
 * place to report tooling trouble, and the archive gate in CI reports read failures properly.
 */
function activeChanges(root) {
  const bin = path.join(root, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
  if (!fs.existsSync(bin)) return null;

  const result = spawnSync(process.execPath, [bin, 'list', '--json'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: TIMEOUT_MS,
    env: { ...process.env, NO_COLOR: '1' },
  });

  if (result.error || result.status !== 0) return null;

  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed?.changes) ? parsed.changes : null;
  } catch {
    return null;
  }
}

function main() {
  const payload = readPayload();

  // Already inside a stop-hook cycle: stay out of it.
  if (payload.stop_hook_active === true) {
    process.exit(0);
  }

  const root = projectDir();
  const changes = activeChanges(root);

  if (changes === null || changes.length === 0) {
    process.exit(0);
  }

  if (alreadyRemindedThisSession(root, payload.session_id)) {
    process.exit(0);
  }

  const lines = changes.map((change) => {
    const total = Number(change.totalTasks ?? 0);
    const done = Number(change.completedTasks ?? 0);
    const progress = total > 0 ? ` (${done}/${total} tasks)` : '';
    return `  - ${change.name}${progress}`;
  });

  finish(
    [
      `OpenSpec: ${changes.length} change(s) still open:`,
      ...lines,
      '',
      'This is a reminder, not a request to close them. Work in progress is a normal state.',
      'When a change is finished: /opsx:verify, then human review, then /opsx:archive.',
      'The archive gate in CI is what enforces the closing state before a final merge.',
    ].join('\n')
  );
}

try {
  main();
} catch {
  process.exit(0);
}
