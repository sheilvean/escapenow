/**
 * Hook payload tests.
 *
 * A hook receives whatever the harness sends, from a machine we do not control, and it runs
 * attached to an unrelated action. So every payload below must produce a clean exit: malformed
 * JSON, empty input, a missing field, a path outside the repository, and `stop_hook_active`.
 *
 * These run the real hook scripts as real processes with real stdin. Calling an exported function
 * would not test the part that breaks — reading stdin and exiting.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');

/** Run a hook with the given stdin. Returns exit code and parsed stdout, if any. */
function runHook(name, input, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(HOOKS, name)], {
    input,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 60_000,
    cwd: ROOT,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, NO_COLOR: '1', ...extraEnv },
  });

  let json = null;
  const trimmed = (result.stdout ?? '').trim();
  if (trimmed.startsWith('{')) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', json };
}

const MALFORMED_PAYLOADS = [
  ['empty string', ''],
  ['whitespace only', '   \n  '],
  ['truncated JSON', '{"tool_input": {"file_path":'],
  ['not JSON at all', 'this is not json'],
  ['a JSON array', '[1, 2, 3]'],
  ['a JSON string', '"just a string"'],
  ['JSON null', 'null'],
  ['a number', '42'],
  ['valid JSON, no fields', '{}'],
  ['tool_input is null', '{"tool_input": null}'],
  ['file_path is a number', '{"tool_input": {"file_path": 7}}'],
  ['file_path is empty', '{"tool_input": {"file_path": ""}}'],
  ['deeply wrong shape', '{"tool_input": {"file_path": {"nested": true}}}'],
];

const ALL_HOOKS = [
  'post-change-feedback.mjs',
  'stop-openspec-reminder.mjs',
  'protected-config-warning.mjs',
];

describe('every hook survives every malformed payload', () => {
  for (const hook of ALL_HOOKS) {
    for (const [label, payload] of MALFORMED_PAYLOADS) {
      test(`${hook} <- ${label}`, () => {
        const result = runHook(hook, payload);

        assert.equal(
          result.status,
          0,
          `${hook} exited ${result.status} on ${label}. A hook must never fail an unrelated ` +
            `action.\nstderr: ${result.stderr}`
        );
        assert.doesNotMatch(
          result.stderr,
          /at .*\n.*at /,
          `${hook} printed a stack trace on ${label}; an unhandled exception attaches noise to ` +
            'whatever the session was doing.'
        );
      });
    }
  }
});

describe('post-change-feedback', () => {
  test('says nothing about a file outside the repository', () => {
    const outside = path.join(os.tmpdir(), 'definitely-outside.cs');
    const result = runHook(
      'post-change-feedback.mjs',
      JSON.stringify({ tool_input: { file_path: outside } })
    );

    assert.equal(result.status, 0);
    assert.equal(result.json, null, 'a file outside the repository is not this hook\'s business');
  });

  test('says nothing about a file that does not exist', () => {
    const result = runHook(
      'post-change-feedback.mjs',
      JSON.stringify({ tool_input: { file_path: 'src/does/not/exist.cs' } })
    );

    assert.equal(result.status, 0);
    assert.equal(result.json, null);
  });

  test('reports invalid JSON in a changed .json file', () => {
    const scratch = path.join(ROOT, 'artifacts', 'hook-test-invalid.json');
    fs.mkdirSync(path.dirname(scratch), { recursive: true });
    fs.writeFileSync(scratch, '{ "trailing": "comma", }', 'utf8');

    try {
      const result = runHook(
        'post-change-feedback.mjs',
        JSON.stringify({ tool_input: { file_path: 'artifacts/hook-test-invalid.json' } })
      );

      assert.equal(result.status, 0);
      assert.ok(result.json?.systemMessage, 'expected an advisory message');
      assert.match(result.json.systemMessage, /not valid JSON/);
    } finally {
      fs.rmSync(scratch, { force: true });
    }
  });

  test('stays quiet on a valid file', () => {
    const result = runHook(
      'post-change-feedback.mjs',
      JSON.stringify({ tool_input: { file_path: 'project.config.json' } })
    );

    assert.equal(result.status, 0);
    assert.equal(result.json, null);
  });

  test('does not run a solution build, a test suite, or repo.mjs', () => {
    // Read the source rather than timing the run: a timing assertion is flaky, and what matters
    // is that the hook cannot invoke these at all.
    //
    // The patterns match invocation sites specifically. Matching the whole file would also hit the
    // advisory message, which tells a human to run `repo.mjs format --write` — that is a
    // suggestion to a person, not something the hook does.
    const source = fs.readFileSync(path.join(HOOKS, 'post-change-feedback.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    const invocations = [...code.matchAll(/(?:run|spawnSync)\(([^;]*?)\);/gs)].map((m) => m[1]);
    assert.ok(invocations.length > 0, 'expected to find the process invocations');

    for (const invocation of invocations) {
      assert.doesNotMatch(
        invocation,
        /repo\.mjs/,
        'invoking repo.mjs would let the hook re-enter itself'
      );
      assert.doesNotMatch(invocation, /'build'/, 'a fast-feedback hook must not build the solution');
      assert.doesNotMatch(invocation, /'test'/, 'a fast-feedback hook must not run tests');
    }
  });
});

describe('stop-openspec-reminder', () => {
  test('is silent when stop_hook_active is true', () => {
    const result = runHook(
      'stop-openspec-reminder.mjs',
      JSON.stringify({ stop_hook_active: true, session_id: 'test-active' })
    );

    assert.equal(result.status, 0);
    assert.equal(
      result.json,
      null,
      'the hook must stay out of a stop-hook cycle it is already inside'
    );
  });

  test('reminds at most once per session', () => {
    const sessionId = `test-once-${Date.now()}`;
    const marker = path.join(ROOT, '.claude', 'state', `stop-reminder-${sessionId}`);
    fs.rmSync(marker, { force: true });

    try {
      const first = runHook(
        'stop-openspec-reminder.mjs',
        JSON.stringify({ stop_hook_active: false, session_id: sessionId })
      );
      const second = runHook(
        'stop-openspec-reminder.mjs',
        JSON.stringify({ stop_hook_active: false, session_id: sessionId })
      );

      assert.equal(first.status, 0);
      assert.equal(second.status, 0);

      // The first may or may not remind, depending on whether a change is open right now. The
      // invariant that holds either way: the second never adds a reminder the first did not.
      if (first.json === null) {
        assert.equal(second.json, null);
      } else {
        assert.match(first.json.systemMessage, /change\(s\) still open/);
        assert.equal(second.json, null, 'the reminder repeated within one session');
      }
    } finally {
      fs.rmSync(marker, { force: true });
    }
  });

  test('never blocks the session', () => {
    const source = fs.readFileSync(path.join(HOOKS, 'stop-openspec-reminder.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    assert.doesNotMatch(code, /process\.exit\([^0]/, 'a non-zero exit from a Stop hook blocks it');
    assert.doesNotMatch(code, /"stop"/, 'decision: "stop" would hold the session open');
    assert.doesNotMatch(code, /stopReason/);
  });

  test('never archives or writes through the OpenSpec CLI', () => {
    const source = fs.readFileSync(path.join(HOOKS, 'stop-openspec-reminder.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    assert.doesNotMatch(code, /'archive'/, 'closing a change is a human decision');
    for (const writing of ["'update'", "'new'", "'validate'"]) {
      assert.doesNotMatch(code, new RegExp(writing.replace(/[$]/g, '')));
    }
    assert.match(code, /'list'/, 'the only CLI call it needs is a read');
  });
});

describe('protected-config-warning', () => {
  test('notes a protected file and says why', () => {
    const result = runHook(
      'protected-config-warning.mjs',
      JSON.stringify({ tool_input: { file_path: '.claude/settings.json' } })
    );

    assert.equal(result.status, 0);
    assert.ok(result.json?.systemMessage);
    assert.match(result.json.systemMessage, /permission rules/);
    assert.match(result.json.systemMessage, /advisory/i);
  });

  test('does not block the edit', () => {
    const result = runHook(
      'protected-config-warning.mjs',
      JSON.stringify({ tool_input: { file_path: '.github/workflows/pr.yml' } })
    );

    assert.equal(result.status, 0, 'exit 2 from a PreToolUse hook would deny the tool call');
    assert.equal(
      result.json?.hookSpecificOutput,
      undefined,
      'emitting a permissionDecision would make this a gate, which it is deliberately not'
    );
  });

  test('says nothing about an ordinary file', () => {
    const result = runHook(
      'protected-config-warning.mjs',
      JSON.stringify({ tool_input: { file_path: 'README.md' } })
    );

    assert.equal(result.status, 0);
    assert.equal(result.json, null);
  });

  test('covers the architecture rule definitions', () => {
    const result = runHook(
      'protected-config-warning.mjs',
      JSON.stringify({
        tool_input: {
          file_path: 'tests/AppTemplate.ArchitectureTests/Support/LayeredProfile.cs',
        },
      })
    );

    assert.equal(result.status, 0);
    assert.match(result.json.systemMessage, /ADR/);
  });
});
