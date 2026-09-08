/**
 * Shell-free child process execution.
 *
 * Every command is passed as an argument vector with `shell: false`, so a value
 * containing shell metacharacters reaches the child as one literal argument and is
 * never interpreted. There is no `eval`, no `new Function`, and no string command
 * concatenation anywhere in this module.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** Arguments must be strings; anything else is a programming error we refuse to guess about. */
function assertArgv(file, args) {
  if (typeof file !== 'string' || file.length === 0) {
    throw new TypeError('proc: executable must be a non-empty string');
  }
  if (!Array.isArray(args)) {
    throw new TypeError('proc: args must be an array');
  }
  for (const [i, a] of args.entries()) {
    if (typeof a !== 'string') {
      throw new TypeError(`proc: args[${i}] must be a string, got ${typeof a}`);
    }
  }
}

/**
 * Run a command and capture its result. Never throws on a non-zero exit; the caller
 * decides what a failure means.
 *
 * @returns {{argv: string[], status: number|null, signal: string|null, stdout: string,
 *            stderr: string, durationMs: number, spawnError: string|null}}
 */
export function run(file, args = [], options = {}) {
  assertArgv(file, args);

  const started = process.hrtime.bigint();
  const result = spawnSync(file, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    timeout: options.timeoutMs,
    input: options.input,
    env: options.env ?? {
      ...process.env,
      // Keep child output parseable and locale-independent.
      NO_COLOR: '1',
      DOTNET_CLI_UI_LANGUAGE: 'en',
      DOTNET_NOLOGO: '1',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    },
  });

  const durationMs = Number((process.hrtime.bigint() - started) / 1000000n);

  return {
    argv: [file, ...args],
    status: result.status,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
    spawnError: result.error ? String(result.error.message) : null,
  };
}

/** The `dotnet` executable. Resolved from PATH by the OS, never through a shell. */
export const DOTNET = 'dotnet';

/** Render an argv for a report. Quoting is display-only; it is never fed back to a shell. */
export function formatArgv(argv) {
  return argv.map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(' ');
}
