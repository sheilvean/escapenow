/**
 * The GitHub Actions workflows.
 *
 * Two things are tested, and the second is the one that matters.
 *
 * First, that the validation works: actionlint really lints, and each policy rule really fires on
 * a workflow that breaks it. A validator nobody has seen fail is a validator that might be
 * checking nothing.
 *
 * Second, that the **aggregate job's script actually rejects a skipped required job.** That is the
 * property `SECURITY.md` and `docs/github-setup.md` promise, it is the one that decides whether a
 * pull request can merge with a check that never ran, and it lives in a `run:` block that no
 * amount of YAML linting can evaluate. So the script is extracted from the shipped workflow and
 * executed here, against fabricated job results.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';
import { run } from '../lib/proc.mjs';
import {
  REQUIRED_CHECKS,
  checkWorkflowPolicy,
  runActionlint,
  workflowFiles,
} from '../lib/workflows.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'workflow-tests');

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

/** A throwaway repository holding one workflow, for the negative cases. */
function withWorkflow(name, yaml, { setupDoc = true } = {}) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'pr.yml'), yaml, 'utf8');

  if (setupDoc) {
    fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
    // Mention every documented name so the doc-consistency rule stays quiet and the case under
    // test is the only thing being reported.
    const names = [...REQUIRED_CHECKS['pr.yml'].jobs, REQUIRED_CHECKS['pr.yml'].aggregate];
    fs.writeFileSync(
      path.join(repo, 'docs', 'github-setup.md'),
      names.map((n) => `\`${n}\``).join('\n') + '\n',
      'utf8'
    );
  }

  return repo;
}

function errorsFor(repo) {
  return checkWorkflowPolicy(repo).filter((f) => f.level === 'error');
}

/** A workflow that satisfies every policy rule, as the starting point for each mutation. */
function goodWorkflow(overrides = {}) {
  const base = {
    permissions: 'contents: read',
    triggerTypes: '[opened, synchronize, reopened, ready_for_review]',
    sha: '3d3c42e5aac5ba805825da76410c181273ba90b1',
    versionComment: '# v7.0.1',
    aggregateIf: 'always()',
    timeout: 'timeout-minutes: 10',
    ...overrides,
  };

  const jobNames = REQUIRED_CHECKS['pr.yml'].jobs;

  const requiredJobs = jobNames
    .map(
      (name) => `  ${name}:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    ${base.timeout}
    steps:
      - uses: actions/checkout@${base.sha} ${base.versionComment}
      - run: npm ci
`
    )
    .join('');

  const env = jobNames
    .map((name) => `          RESULT_${name.toUpperCase().replaceAll('-', '_')}: \${{ needs.${name}.result }}`)
    .join('\n');

  const entries = jobNames
    .map((name) => `            "${name}:\${RESULT_${name.toUpperCase().replaceAll('-', '_')}:-missing}" \\`)
    .join('\n');

  return `name: pr

on:
  pull_request:
    types: ${base.triggerTypes}
  merge_group:

permissions:
  ${base.permissions}

jobs:
${requiredJobs}  ${REQUIRED_CHECKS['pr.yml'].aggregate}:
    if: ${base.aggregateIf}
    needs: [${jobNames.join(', ')}]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    ${base.timeout}
    steps:
      - name: Assert every required job succeeded
        env:
${env}
        run: |
          set -euo pipefail
          failed=0
          for entry in \\
${entries}
          do
            job="\${entry%%:*}"
            result="\${entry#*:}"
            printf '%-18s %s\\n' "$job" "$result"
            if [ "$result" != "success" ]; then
              echo "::error::Required job '$job' reported '$result', not 'success'."
              failed=1
            fi
          done
          if [ "$failed" -ne 0 ]; then
            echo "A skipped or cancelled required job is not a pass."
            exit 1
          fi
          echo "All required jobs succeeded."
`;
}

describe('the shipped workflows are valid and honour the documented policy', () => {
  test('actionlint reports nothing', async () => {
    const findings = await runActionlint(ROOT);

    assert.deepEqual(
      findings,
      [],
      'actionlint findings:\n' + findings.map((f) => `${f.file} ${f.message}`).join('\n')
    );
  });

  test('actionlint is really linting, not silently doing nothing', async () => {
    // Positive control for the test above. Without it, "no findings" and "the linter never ran"
    // are indistinguishable.
    const repo = withWorkflow(
      'actionlint-control',
      [
        'name: broken',
        'on: [push]',
        'jobs:',
        '  a:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout',
        '    if: ${{ nonexistent_func(1) }}',
        '',
      ].join('\n')
    );

    const findings = await runActionlint(repo);

    assert.ok(findings.length >= 2, `expected the linter to object; got ${findings.length} finding(s)`);
    assert.match(findings.map((f) => f.message).join('\n'), /undefined function/);
  });

  test('every policy rule is satisfied', () => {
    const errors = errorsFor(ROOT);

    assert.deepEqual(
      errors,
      [],
      'policy errors:\n' + errors.map((f) => `${f.file} ${f.message}`).join('\n')
    );
  });

  test('the fabricated reference workflow is accepted', () => {
    // Proves the negative cases below differ from a good workflow in exactly one respect.
    const repo = withWorkflow('reference-good', goodWorkflow());

    assert.deepEqual(
      errorsFor(repo),
      [],
      'the reference workflow should satisfy every rule:\n' +
        errorsFor(repo).map((f) => f.message).join('\n')
    );
  });

  test('every workflow file the repository ships is validated', () => {
    const files = workflowFiles(ROOT).map((f) => f.name);

    assert.ok(files.length >= 2, `expected at least two workflows, found ${files.join(', ')}`);
    for (const name of Object.keys(REQUIRED_CHECKS)) {
      assert.ok(files.includes(name), `${name} is missing`);
    }
  });
});

describe('each policy rule fires on a workflow that breaks it', () => {
  const cases = [
    [
      'no workflow-level permissions',
      goodWorkflow().replace('permissions:\n  contents: read\n\njobs:', 'jobs:'),
      /no workflow-level permissions/,
    ],
    [
      'a tag instead of a commit SHA',
      goodWorkflow({ sha: 'v7.0.1' }),
      /not a 40-character commit SHA/,
    ],
    [
      'a SHA with no version comment',
      goodWorkflow({ versionComment: '' }),
      /no "# vX\.Y\.Z" comment/,
    ],
    [
      'an unreviewed action',
      goodWorkflow().replace(
        'actions/checkout@',
        'some-random/action@'
      ),
      /not on the reviewed list/,
    ],
    [
      'pull_request_target',
      goodWorkflow().replace('  pull_request:', '  pull_request_target:'),
      /pull_request_target/,
    ],
    [
      'no ready_for_review trigger',
      goodWorkflow({ triggerTypes: '[opened, synchronize]' }),
      /ready_for_review/,
    ],
    [
      'a repository secret',
      goodWorkflow().replace(
        '      - run: npm ci',
        ['      - name: Report', '        run: echo ${{ secrets.DEPLOY_KEY }}'].join('\n')
      ),
      /repository secret "DEPLOY_KEY"/,
    ],
    [
      'a job with no timeout',
      goodWorkflow({ timeout: 'env:\n      NOOP: "1"' }),
      /no timeout-minutes/,
    ],
    [
      'an aggregate without if: always()',
      goodWorkflow({ aggregateIf: "github.event_name == 'pull_request'" }),
      /must be guarded by `if: always\(\)`/,
    ],
    [
      'an aggregate that does not need a required job',
      goodWorkflow().replace('needs: [checks, dependency-scan, secret-scan, archive-gate]', 'needs: [checks]'),
      /does not need "dependency-scan"/,
    ],
    [
      'an aggregate that ignores a job result',
      goodWorkflow().replace(
        '          RESULT_SECRET_SCAN: ${{ needs.secret-scan.result }}\n',
        ''
      ),
      /never reads needs\.secret-scan\.result/,
    ],
    [
      'an aggregate that cannot fail',
      goodWorkflow().replace('            exit 1\n', ''),
      /never exits non-zero/,
    ],
    [
      'a step that reimplements a check instead of calling an entry point',
      goodWorkflow().replace('      - run: npm ci', '      - run: dotnet test tests/Some.Tests'),
      /not a repository entry point/,
    ],
    [
      'an approved prefix carrying a chained command behind it',
      goodWorkflow().replace(
        '      - run: npm ci',
        '      - run: node tools/repo.mjs check && dotnet test tests/Some.Tests'
      ),
      /chains or redirects/,
    ],
    [
      'a multi-line script that is not named plumbing',
      goodWorkflow().replace(
        '      - run: npm ci',
        ['      - run: |', '          npm ci', '          npm audit'].join('\n')
      ),
      /second implementation of a rule/,
    ],
    [
      'a missing required job',
      // archive-gate is the last required job, so the non-greedy match ends at its own step.
      goodWorkflow().replace(/  archive-gate:\n(?:.*\n)*?      - run: npm ci\n/, ''),
      /does not define the job "archive-gate"/,
    ],
  ];

  for (const [label, yaml, expected] of cases) {
    test(label, () => {
      const repo = withWorkflow(`negative-${label.replace(/\W+/g, '-')}`, yaml);
      const errors = errorsFor(repo);

      assert.ok(
        errors.some((f) => expected.test(f.message)),
        `no error matched ${expected}. Errors were:\n` +
          (errors.map((f) => `  ${f.message}`).join('\n') || '  (none)')
      );
    });
  }

  test('a missing workflow directory is reported, not passed over', () => {
    const repo = path.join(SCRATCH, 'no-workflows');
    fs.mkdirSync(repo, { recursive: true });

    const errors = errorsFor(repo);

    assert.ok(errors.length > 0, 'an absent .github/workflows/ must be reported');
  });
});

/**
 * The aggregate job's script, extracted from the shipped workflow and executed.
 *
 * This is the only way to know that "a skipped required job is not a pass" is true. YAML linting
 * cannot evaluate a shell script, and a copy of the script in a test would only prove the copy
 * works.
 */
describe('the aggregate script rejects anything that is not success', () => {
  /** Pull the aggregate step's script and env out of a shipped workflow. */
  function aggregateStep(workflowName) {
    const workflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', workflowName), 'utf8')
    );

    const { aggregate, jobs: requiredJobs } = REQUIRED_CHECKS[workflowName];
    const job = workflow.jobs[aggregate];
    assert.ok(job, `${workflowName} has no "${aggregate}" job`);

    const step = (job.steps ?? []).find((s) => typeof s?.run === 'string' && s.run.includes('exit 1'));
    assert.ok(step, `the "${aggregate}" job has no script that can fail`);

    // Map each job name to the environment variable the step reads it through, so a rename of
    // either side is caught here rather than in production.
    const variableFor = {};
    for (const [variable, expression] of Object.entries(step.env ?? {})) {
      const match = /needs\.([A-Za-z0-9_-]+)\.result/.exec(String(expression));
      if (match) variableFor[match[1]] = variable;
    }

    for (const jobName of requiredJobs) {
      assert.ok(
        variableFor[jobName],
        `the aggregate step does not expose needs.${jobName}.result as an environment variable`
      );
    }

    return { script: step.run, variableFor, requiredJobs };
  }

  /** Execute the script with the given per-job results. Returns the exit code and output. */
  function execute({ script, variableFor }, results) {
    const env = { PATH: process.env.PATH, ...Object.create(null) };
    for (const [jobName, variable] of Object.entries(variableFor)) {
      env[variable] = results[jobName] ?? '';
    }

    return run('bash', ['-c', script], { env, timeoutMs: 30_000 });
  }

  const bashAvailable = run('bash', ['-c', 'echo ok']).status === 0;

  for (const workflowName of Object.keys(REQUIRED_CHECKS)) {
    describe(workflowName, () => {
      test('all jobs successful → exits 0', (t) => {
        if (!bashAvailable) return t.skip('bash is not available on this machine');

        const step = aggregateStep(workflowName);
        const allSuccess = Object.fromEntries(step.requiredJobs.map((j) => [j, 'success']));

        const result = execute(step, allSuccess);

        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /All required .*jobs succeeded/);
      });

      // The four states that are not success. Each must fail, and skipped is the one this whole
      // arrangement exists for: a required job that never ran must not read as a pass.
      for (const bad of ['skipped', 'cancelled', 'failure', '']) {
        for (const target of REQUIRED_CHECKS[workflowName].jobs) {
          const label = bad === '' ? 'missing' : bad;

          test(`${target} = ${label} → exits non-zero`, (t) => {
            if (!bashAvailable) return t.skip('bash is not available on this machine');

            const step = aggregateStep(workflowName);
            const results = Object.fromEntries(step.requiredJobs.map((j) => [j, 'success']));
            results[target] = bad;

            const result = execute(step, results);

            assert.notEqual(
              result.status,
              0,
              `the aggregate accepted ${target}=${label}. A required job that reported ` +
                `"${label}" is not a pass.\n${result.stdout}${result.stderr}`
            );
            assert.match(result.stdout, new RegExp(`Required job '${target}' reported`));
            assert.match(result.stdout, /not a pass/);
          });
        }
      }
    });
  }
});

/**
 * The secret scanner's fail-closed download.
 *
 * The claim in SECURITY.md is specific: a checksum mismatch fails the job **without executing the
 * binary**. That is a branch in a shell script, so the only way to know it holds is to run it.
 * The step skips the download when the archive is already present, so these cases plant an
 * archive with a known digest and need no network.
 */
describe('the gitleaks download verifies its checksum and fails closed', () => {
  const bashAvailable = run('bash', ['-c', 'echo ok']).status === 0;

  /** The secret-scan step's script and its pinned version and digest. */
  function downloadStep() {
    const workflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pr.yml'), 'utf8')
    );

    const job = workflow.jobs['secret-scan'];
    assert.ok(job, 'pr.yml has no secret-scan job');

    const step = (job.steps ?? []).find(
      (s) => typeof s?.run === 'string' && s.run.includes('sha256sum')
    );
    assert.ok(step, 'the secret-scan job has no checksum-verifying step');

    const version = job.env?.GITLEAKS_VERSION;
    const digest = job.env?.GITLEAKS_SHA256;
    assert.match(String(version), /^\d+\.\d+\.\d+$/, 'GITLEAKS_VERSION must be an exact version');
    assert.match(String(digest), /^[0-9a-f]{64}$/, 'GITLEAKS_SHA256 must be a SHA-256 hex digest');

    return { script: step.run, version: String(version), digest: String(digest) };
  }

  /**
   * Run the step in a scratch directory with a planted archive.
   *
   * @param plantedContent Bytes to write as the "downloaded" archive.
   * @param digest The digest the workflow will compare against.
   */
  function executeWith(name, plantedContent, digest, version) {
    const dir = path.join(SCRATCH, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, `gitleaks_${version}_linux_x64.tar.gz`), plantedContent);

    const { script } = downloadStep();

    return {
      dir,
      result: run('bash', ['-c', script], {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          GITLEAKS_VERSION: version,
          GITLEAKS_SHA256: digest,
        },
        timeoutMs: 60_000,
      }),
    };
  }

  test('the pinned digest is a real SHA-256 and the version is exact', () => {
    // Guards against the placeholder-that-looks-real failure: a made-up digest would pass a
    // shape check but never match, so the job would fail for the wrong reason. This asserts the
    // shape; the value itself was taken from the release's own checksums.txt.
    downloadStep();
  });

  test('a mismatched checksum fails and deletes the archive without extracting it', (t) => {
    if (!bashAvailable) return t.skip('bash is not available on this machine');

    const { version } = downloadStep();
    const wrongDigest = 'f'.repeat(64);

    const { dir, result } = executeWith('gitleaks-mismatch', 'not the real archive\n', wrongDigest, version);

    assert.notEqual(result.status, 0, 'a checksum mismatch must fail the job');
    assert.match(result.stdout + result.stderr, /checksum mismatch/);
    assert.match(result.stdout + result.stderr, /NOT executed/);

    assert.ok(
      !fs.existsSync(path.join(dir, `gitleaks_${version}_linux_x64.tar.gz`)),
      'the unverified archive must be deleted'
    );
    assert.ok(
      !fs.existsSync(path.join(dir, 'gitleaks')),
      'the binary must not have been extracted from an unverified archive'
    );
  });

  test('a matching checksum gets past the check and on to extraction', (t) => {
    if (!bashAvailable) return t.skip('bash is not available on this machine');

    const { version } = downloadStep();

    // A file whose real digest we compute, so the comparison succeeds. Extraction then fails,
    // because this is not a real tarball — and that is the point: the script got past the
    // checksum gate, which is the branch under test. `set -euo pipefail` makes tar's failure the
    // exit code, so the assertion is about *where* it failed.
    const content = 'a planted archive whose digest we know\n';
    const digest = run('bash', ['-c', 'sha256sum - | cut -d" " -f1'], {
      input: content,
    }).stdout.trim();

    assert.match(digest, /^[0-9a-f]{64}$/, 'could not compute a digest to test with');

    const { dir, result } = executeWith('gitleaks-match', content, digest, version);

    assert.doesNotMatch(
      result.stdout + result.stderr,
      /checksum mismatch/,
      'a matching digest must not be reported as a mismatch'
    );
    assert.ok(
      fs.existsSync(path.join(dir, `gitleaks_${version}_linux_x64.tar.gz`)),
      'a verified archive must not be deleted'
    );
    assert.match(result.stderr + result.stdout, /tar|gzip/i, 'expected it to proceed to extraction');
  });
});
