/**
 * Check-pipeline parsers.
 *
 * The test-count parser is the one that decides whether a green `dotnet test` is evidence.
 * Microsoft.Testing.Platform colours its summary even when NO_COLOR=1, and a parser that
 * requires the label at column zero then reports a real run as zero tests.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTestSummary, readVitestReport, runCheck, STAGE_NAMES } from '../lib/check.mjs';

describe('extractTestSummary', () => {
  test('reads an uncoloured Microsoft.Testing.Platform block', () => {
    const output = `
Test run summary: Passed!
  total: 23
    failed: 0
  succeeded: 23
  skipped: 0
    duration: 793ms
`;

    assert.deepEqual(extractTestSummary(output), {
      total: 23,
      succeeded: 23,
      skipped: 0,
      failed: 0,
    });
  });

  test('reads a CSI-coloured block the way ubuntu-latest actually prints it', () => {
    // Captured from the PR checks job: the reset/green prefixes sit in front of the labels,
    // so `^\\s*total:` does not match until they are stripped.
    const output = [
      '\u001b[m/home/runner/work/app/app/artifacts/bin/UnitTests/debug/UnitTests.dll (net10.0|x64) \u001b[32mpassed\u001b[m \u001b[90m(502ms)\u001b[m',
      '',
      '\u001b[32mTest run summary: Passed!',
      '\u001b[m  total: 23',
      '\u001b[m    failed: 0',
      '\u001b[32m  succeeded: 23',
      '\u001b[m  skipped: 0',
      '    duration: 793ms',
      '',
    ].join('\n');

    assert.deepEqual(extractTestSummary(output), {
      total: 23,
      succeeded: 23,
      skipped: 0,
      failed: 0,
    });
  });

  test('treats a missing summary as zero tests, not as a parse error disguised as success', () => {
    assert.deepEqual(extractTestSummary('passed\n'), {
      total: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
    });
  });
});


/**
 * The frontend test report.
 *
 * The stage refuses to call a run green on an exit code, so everything it decides with comes from
 * this reader. Each way the report can be useless is a case here, because "the runner exited 0"
 * has already been shown, in this repository, not to mean the tests ran.
 */
describe('readVitestReport', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-report-'));

  const write = (name, content) => {
    const file = path.join(scratch, name);
    fs.writeFileSync(file, content, 'utf8');
    return file;
  };

  after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  test('reads the counts a passing run writes', () => {
    const file = write(
      'pass.json',
      JSON.stringify({ numTotalTests: 3, numPassedTests: 3, numFailedTests: 0, success: true })
    );

    assert.deepEqual(readVitestReport(file), {
      readable: true,
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      executed: 3,
    });
  });

  test('reads the counts a failing run writes', () => {
    const file = write(
      'fail.json',
      JSON.stringify({ numTotalTests: 3, numPassedTests: 2, numFailedTests: 1, success: false })
    );

    assert.deepEqual(readVitestReport(file), {
      readable: true,
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      executed: 3,
    });
  });

  test('reports a run that executed nothing as zero, not as absent', () => {
    const file = write(
      'empty.json',
      JSON.stringify({ numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, success: true })
    );

    // readable, because the runner did answer. The stage is what turns 0 into a failure.
    assert.deepEqual(readVitestReport(file), {
      readable: true,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      executed: 0,
    });
  });

  // Captured from a real run with all three specs marked `it.skip`: the runner counts them in
  // its total, reports success and exits 0. Counting collected tests instead of executed ones
  // would let a suite that ran nothing report green, which is the failure this stage exists for.
  test('a suite where every test is skipped executed nothing', () => {
    const file = write(
      'all-skipped.json',
      JSON.stringify({
        numTotalTests: 3,
        numPassedTests: 0,
        numFailedTests: 0,
        numPendingTests: 3,
        success: true,
      })
    );

    assert.deepEqual(readVitestReport(file), {
      readable: true,
      total: 3,
      passed: 0,
      failed: 0,
      skipped: 3,
      executed: 0,
    });
  });

  test('counts todo tests as skipped as well', () => {
    const file = write(
      'todo.json',
      JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 3,
        numFailedTests: 0,
        numPendingTests: 1,
        numTodoTests: 1,
      })
    );

    const result = readVitestReport(file);

    assert.equal(result.skipped, 2);
    assert.equal(result.executed, 3);
  });

  test('a report that was never written is unreadable, not empty', () => {
    const result = readVitestReport(path.join(scratch, 'does-not-exist.json'));

    assert.equal(result.readable, false);
    assert.match(result.reason, /not written/);
  });

  test('a truncated report is unreadable rather than silently zero', () => {
    const file = write('truncated.json', '{ "numTotalTests": 3');

    const result = readVitestReport(file);

    assert.equal(result.readable, false);
    assert.match(result.reason, /not valid JSON/);
  });

  test('valid JSON carrying no counts is unreadable', () => {
    const file = write('countless.json', JSON.stringify({ testResults: [] }));

    const result = readVitestReport(file);

    assert.equal(result.readable, false);
    assert.match(result.reason, /no test counts/);
  });

  test('a non-integer count is not coerced into one', () => {
    const file = write(
      'stringly.json',
      JSON.stringify({ numTotalTests: '3', numPassedTests: '3', numFailedTests: '0' })
    );

    assert.equal(readVitestReport(file).readable, false);
  });
});

/**
 * The frontend stages, driven through the real pipeline with a configuration that points at a
 * directory the test controls. Nothing here builds or runs Angular: every case is one the pipeline
 * must decide before it would launch anything.
 */
describe('the frontend stages', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-stage-'));

  after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  const baseConfig = (frontend) => ({
    solutionName: 'X',
    rootNamespace: 'X',
    paths: { solutionFile: 'X.slnx', src: 'src', tests: 'tests', ...(frontend ? { frontend } : {}) },
  });

  const frontendStages = async (root, config) => {
    const { results } = await runCheck({ root, config, ci: false });
    return Object.fromEntries(
      results.filter((r) => r.name.startsWith('frontend:')).map((r) => [r.name, r])
    );
  };

  test('are declared in the stage list, between the integration tests and the specs', () => {
    assert.deepEqual(
      STAGE_NAMES.slice(STAGE_NAMES.indexOf('test:integration')),
      ['test:integration', 'frontend:build', 'frontend:test', 'specs', 'agent-config', 'workflows', 'tools']
    );
  });

  test('report not configured when no frontend is declared', async () => {
    const root = path.join(scratch, 'undeclared');
    fs.mkdirSync(root, { recursive: true });

    const stages = await frontendStages(root, baseConfig(null));

    for (const stage of Object.values(stages)) {
      assert.equal(stage.status, 'not-configured');
      assert.match(stage.messages.join('\n'), /not a pass/);
    }
  });

  test('fail when the declared frontend directory does not exist', async () => {
    const root = path.join(scratch, 'missing');
    fs.mkdirSync(root, { recursive: true });

    const stages = await frontendStages(root, baseConfig('frontend'));

    for (const stage of Object.values(stages)) {
      assert.equal(stage.status, 'failed');
      assert.match(stage.messages.join('\n'), /does not exist/);
    }
  });

  test('fail, naming the install command, when the frontend is not installed', async () => {
    const root = path.join(scratch, 'uninstalled');
    fs.mkdirSync(path.join(root, 'frontend'), { recursive: true });

    const stages = await frontendStages(root, baseConfig('frontend'));

    for (const stage of Object.values(stages)) {
      assert.equal(stage.status, 'failed');
      assert.match(stage.messages.join('\n'), /npm ci/);
    }
  });
});
