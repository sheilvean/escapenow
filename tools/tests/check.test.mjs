/**
 * Check-pipeline parsers.
 *
 * The test-count parser is the one that decides whether a green `dotnet test` is evidence.
 * Microsoft.Testing.Platform colours its summary even when NO_COLOR=1, and a parser that
 * requires the label at column zero then reports a real run as zero tests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractTestSummary } from '../lib/check.mjs';

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
