/**
 * The check pipeline.
 *
 * One ordered list of stages, one implementation. CI runs this same entry point rather than
 * restating the rules in YAML, so a green local run and a green CI run mean the same thing.
 *
 * Three outcomes, never conflated:
 *   passed          the stage ran and succeeded
 *   failed          the stage ran and did not succeed
 *   not-configured  the stage depends on an integration this repository has not enabled
 *
 * "not configured" never counts as success. A stage that cannot run because a required file was
 * deleted is `failed`, not `not-configured`: the difference between "we chose not to" and
 * "something is missing" is exactly what a check exists to tell you.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DOTNET, formatArgv, run } from './proc.mjs';
import { findForeignKeys } from './config.mjs';
import { plannedRegions, findDrift } from './generated.mjs';
import { validateAgentConfig } from './agentconfig.mjs';
import { cli, installedVersion, installedWorkflows, lockedVersion, pinnedVersion } from './openspec.mjs';
import { checkWorkflowPolicy, runActionlint } from './workflows.mjs';

/** @typedef {'passed'|'failed'|'not-configured'} StageStatus */

/**
 * @typedef {object} StageResult
 * @property {string} name
 * @property {StageStatus} status
 * @property {string[]} commands  Exact command lines that ran, for the report.
 * @property {string[]} messages
 * @property {number} durationMs
 */

const REQUIRED_FILES = [
  'global.json',
  'Directory.Build.props',
  'Directory.Packages.props',
  '.editorconfig',
  'NuGet.config',
  'package.json',
  'package-lock.json',
  'project.config.schema.json',
  'CLAUDE.md',
  '.claude/settings.json',
  'openspec/config.yaml',
];

export const STAGE_NAMES = [
  'config',
  'format',
  'build',
  'test:unit',
  'test:arch',
  'test:integration',
  'specs',
  'agent-config',
  'workflows',
  'tools',
];

/**
 * Run every stage in order.
 *
 * @param {{root: string, config: object, ci: boolean}} context
 * @returns {{results: StageResult[], ok: boolean}}
 */
export async function runCheck({ root, config, ci }) {
  const results = [];

  results.push(stageConfig(root, config));
  results.push(stageFormat(root, config));
  results.push(stageBuild(root, config, ci));
  results.push(stageTest(root, config, 'test:unit', 'UnitTests'));
  results.push(stageTest(root, config, 'test:arch', 'ArchitectureTests'));
  results.push(stageTest(root, config, 'test:integration', 'IntegrationTests'));
  results.push(stageSpecs(root));
  results.push(stageAgentConfig(root));
  results.push(await stageWorkflows(root));
  results.push(stageTools(root));

  return { results, ok: results.every((r) => r.status !== 'failed') };
}

function timed(name, body) {
  const started = process.hrtime.bigint();
  const partial = body();
  return {
    name,
    durationMs: Number((process.hrtime.bigint() - started) / 1000000n),
    ...partial,
  };
}

/**
 * Configuration and generated-file validation.
 *
 * Includes the checks that keep the configuration from becoming a second dependency manager:
 * a value owned by global.json, Directory.Packages.props, package.json, OpenSpec or an ADR must
 * not be restated here.
 */
function stageConfig(root, config) {
  return timed('config', () => {
    const messages = [];

    // The configuration already passed its schema in config.mjs before we got here.
    messages.push('project.config.json satisfies project.config.schema.json');

    for (const relative of REQUIRED_FILES) {
      if (!fs.existsSync(path.join(root, relative))) {
        messages.push(`MISSING required file: ${relative}`);
      }
    }

    const foreign = findForeignKeys(config);
    for (const { pointer, key, owner } of foreign) {
      messages.push(
        `project.config.json declares "${key}" at ${pointer}, but ${owner} owns that value. ` +
          'Two sources of truth for one value will drift.'
      );
    }

    // Identity consistency: the two name tokens share one placeholder, so a project that makes
    // them differ must declare an explicit RootNamespace or its namespaces will not match.
    if (config.rootNamespace !== config.solutionName) {
      const props = path.join(root, 'Directory.Build.props');
      const declaresRootNamespace =
        fs.existsSync(props) && fs.readFileSync(props, 'utf8').includes('<RootNamespace>');

      if (!declaresRootNamespace) {
        messages.push(
          `rootNamespace ("${config.rootNamespace}") differs from solutionName ` +
            `("${config.solutionName}"), but no project declares an explicit <RootNamespace>. ` +
            'The SDK derives the namespace from the project file name, so namespaces would follow ' +
            'solutionName instead. See docs/ARCHITECTURE.md.'
        );
      }
    }

    const missingFiles = messages.filter((m) => m.startsWith('MISSING'));

    // Generated-region drift.
    let drift = [];
    try {
      drift = findDrift(root, plannedRegions(root, config));
    } catch (error) {
      messages.push(`Could not evaluate generated regions: ${error.message}`);
    }
    for (const { file, reason } of drift) {
      messages.push(`DRIFT ${file}: ${reason}`);
    }

    const failed =
      missingFiles.length > 0 ||
      foreign.length > 0 ||
      drift.length > 0 ||
      messages.some((m) => m.startsWith('rootNamespace') || m.startsWith('Could not evaluate'));

    return {
      status: failed ? 'failed' : 'passed',
      commands: ['(in-process: schema validation, required files, source-of-truth and drift checks)'],
      messages,
    };
  });
}

/** Formatting is verified, never applied. `repo.mjs format --write` is the separate fix command. */
function stageFormat(root, config) {
  return timed('format', () => {
    const solution = config.paths.solutionFile;
    const result = run(DOTNET, ['format', solution, '--verify-no-changes'], { cwd: root });

    return {
      status: result.status === 0 ? 'passed' : 'failed',
      commands: [formatArgv(result.argv)],
      messages:
        result.status === 0
          ? ['no formatting differences']
          : [
              'Formatting differs from .editorconfig. This stage does not modify files; run ' +
                '`node tools/repo.mjs format --write` to apply.',
              (result.stdout + result.stderr).trim().split('\n').slice(0, 20).join('\n'),
            ],
    };
  });
}

function stageBuild(root, config, ci) {
  return timed('build', () => {
    // Analyzers and the warnings-as-errors policy come from Directory.Build.props, so a plain
    // build is the whole check. `--no-incremental` in CI so a stale artifact cannot hide a break.
    const args = ['build', config.paths.solutionFile];
    if (ci) args.push('--no-incremental');

    const result = run(DOTNET, args, { cwd: root, env: ciEnv(ci) });

    return {
      status: result.status === 0 ? 'passed' : 'failed',
      commands: [formatArgv(result.argv)],
      messages:
        result.status === 0
          ? ['build succeeded with warnings treated as errors']
          : [tail(result, 30)],
    };
  });
}

/**
 * One test project per stage.
 *
 * Categories are separate projects rather than filters on purpose: it keeps the report
 * attributable to one command, and it avoids depending on either test runner's filter syntax.
 * The runner itself is selected once, in global.json.
 */
function stageTest(root, config, stageName, projectSuffix) {
  return timed(stageName, () => {
    const projectName = `${config.solutionName}.${projectSuffix}`;
    const project = path.join(config.paths.tests, projectName, `${projectName}.csproj`);
    const absolute = path.join(root, project);

    if (!fs.existsSync(absolute)) {
      // A missing test project is a failure, not an absence of work to do. Reporting it as
      // "not configured" would let deleting a test project turn a stage green.
      return {
        status: 'failed',
        commands: [],
        messages: [
          `The test project ${project} does not exist. A required test stage cannot be skipped ` +
            'into a pass; restore the project or change the configuration deliberately.',
        ],
      };
    }

    const result = run(DOTNET, ['test', project], { cwd: root });
    const summary = extractTestSummary(result.stdout + result.stderr);

    // Zero executed tests is not success. A project that ran no test proves nothing.
    if (result.status === 0 && summary.total === 0) {
      return {
        status: 'failed',
        commands: [formatArgv(result.argv)],
        messages: [
          `${projectName} reported success but executed 0 tests. An empty run is not evidence.`,
          tail(result, 15),
        ],
      };
    }

    return {
      status: result.status === 0 ? 'passed' : 'failed',
      commands: [formatArgv(result.argv)],
      messages:
        result.status === 0
          ? [`${summary.total} test(s): ${summary.succeeded} succeeded, ${summary.skipped} skipped`]
          : [tail(result, 30)],
    };
  });
}

/** OpenSpec artifact validation, through the pinned local CLI. */
function stageSpecs(root) {
  return timed('specs', () => {
    const messages = [];

    const pinned = pinnedVersion(root);
    const locked = lockedVersion(root);
    const installed = installedVersion(root);

    if (!installed) {
      return {
        status: 'failed',
        commands: [],
        messages: [
          'The OpenSpec CLI is not installed. Run `npm ci` to install the pinned version from ' +
            'the lockfile. The template deliberately does not fall back to a global install or ' +
            'to `latest`.',
        ],
      };
    }
    if (locked && installed !== locked) {
      messages.push(
        `The installed OpenSpec CLI is ${installed} but the lockfile pins ${locked}. ` +
          'Run `npm ci` so the check runs against the version the repository declares.'
      );
    }
    if (pinned && !pinned.startsWith(installed)) {
      messages.push(`package.json requests ${pinned}; ${installed} is installed.`);
    }

    const result = cli(root, ['validate', '--all', '--strict']);
    const output = result.stdout + result.stderr;
    messages.push(tail(result, 25));

    // A repository with no specs and no changes is legitimate on day one, and the CLI says so
    // with exit 0. Surface it rather than letting "passed" imply something was checked.
    if (/No items found to validate/.test(output)) {
      messages.push(
        'Nothing to validate yet: openspec/specs/ and openspec/changes/ are both empty. The ' +
          'stage passed because the CLI succeeded, not because any requirement was checked.'
      );
    }

    const workflows = installedWorkflows(root);
    messages.push(`OpenSpec integration exposes: ${workflows.join(', ') || '(none)'}`);

    if (!workflows.includes('verify')) {
      // Reported, not silently accepted: /opsx:verify comes from a machine-wide OpenSpec profile,
      // so a contributor can be missing it. It is a real gap in the workflow, and the check says so.
      messages.push(
        'The `verify` workflow is not installed, so /opsx:verify is unavailable in this ' +
          'checkout. It comes from the machine-wide OpenSpec profile — see ' +
          'docs/updating-dependencies.md. Reported as a finding, never as configured.'
      );
    }

    const failed = result.status !== 0 || messages.some((m) => m.startsWith('The installed OpenSpec'));

    return {
      status: failed ? 'failed' : 'passed',
      commands: [formatArgv(result.argv)],
      messages,
    };
  });
}

function stageAgentConfig(root) {
  return timed('agent-config', () => {
    const findings = validateAgentConfig(root);
    const errors = findings.filter((f) => f.level === 'error');

    return {
      status: errors.length > 0 ? 'failed' : 'passed',
      commands: ['(in-process: .claude/ validation)'],
      messages:
        findings.length === 0
          ? ['no findings']
          : findings.map((f) => `${f.level === 'error' ? 'ERROR' : 'info '} ${f.file ?? ''} ${f.message}`),
    };
  });
}

/**
 * The GitHub Actions workflows.
 *
 * Two layers: actionlint answers "is this valid?", and the policy checks answer "does this do
 * what SECURITY.md and docs/github-setup.md say it does?" A documented safety property that
 * nothing verifies is one that has already drifted.
 *
 * Async because actionlint is a WASM module that has to be instantiated.
 */
async function stageWorkflows(root) {
  const started = process.hrtime.bigint();

  const workflowDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) {
    return {
      name: 'workflows',
      durationMs: Number((process.hrtime.bigint() - started) / 1000000n),
      status: 'not-configured',
      commands: [],
      messages: [
        '.github/workflows/ does not exist, so there is no CI to validate. Reported as not ' +
          'configured — this is not a pass.',
      ],
    };
  }

  const findings = [...(await runActionlint(root)), ...checkWorkflowPolicy(root)];
  const errors = findings.filter((f) => f.level === 'error');

  return {
    name: 'workflows',
    durationMs: Number((process.hrtime.bigint() - started) / 1000000n),
    status: errors.length > 0 ? 'failed' : 'passed',
    commands: ['(in-process: actionlint (wasm) + workflow policy checks)'],
    messages:
      findings.length === 0
        ? ['actionlint reports no findings; every documented safety property holds']
        : findings.map((f) => `${f.level === 'error' ? 'ERROR' : 'info '} ${f.file} ${f.message}`),
  };
}

/** The repository tooling's own tests. Node's built-in runner, so there is nothing extra to install. */
function stageTools(root) {
  return timed('tools', () => {
    const testDir = path.join(root, 'tools', 'tests');
    if (!fs.existsSync(testDir)) {
      return {
        status: 'failed',
        commands: [],
        messages: [
          'tools/tests/ does not exist. The tooling that enforces every other stage would be ' +
            'unverified.',
        ],
      };
    }

    // Files are enumerated here rather than handed to the runner as a glob: the argv reaches the
    // child without a shell, so a glob would arrive unexpanded. The explicit list also makes the
    // reported command reproducible.
    const testFiles = fs
      .globSync('tools/tests/*.test.mjs', { cwd: root })
      .map((p) => p.split(path.sep).join('/'))
      .sort();

    if (testFiles.length === 0) {
      return {
        status: 'failed',
        commands: [],
        messages: [
          'tools/tests/ contains no *.test.mjs files. The tooling that enforces every other ' +
            'stage would be unverified.',
        ],
      };
    }

    // The TAP reporter is requested explicitly: Node's default reporter is not stable to parse,
    // and a run whose count cannot be read must not be mistaken for a run of zero tests.
    const result = run(
      process.execPath,
      ['--test', '--test-reporter=tap', ...testFiles],
      { cwd: root }
    );
    const combined = result.stdout + result.stderr;
    const passMatch = /^# pass (\d+)$/m.exec(combined);
    const pass = passMatch === null ? null : Number(passMatch[1]);

    if (pass === null) {
      return {
        status: 'failed',
        commands: [formatArgv(result.argv)],
        messages: [
          'Could not read the test count from the runner output, so the run cannot be treated as ' +
            'evidence either way.',
          tail(result, 20),
        ],
      };
    }

    if (result.status === 0 && pass === 0) {
      return {
        status: 'failed',
        commands: [formatArgv(result.argv)],
        messages: ['The tooling test run executed 0 tests. An empty run is not evidence.'],
      };
    }

    return {
      status: result.status === 0 ? 'passed' : 'failed',
      commands: [formatArgv(result.argv)],
      messages: result.status === 0 ? [`${pass} tooling test(s) passed`] : [tail(result, 40)],
    };
  });
}

function ciEnv(ci) {
  return ci ? { ...process.env, CI: 'true', NO_COLOR: '1', DOTNET_CLI_UI_LANGUAGE: 'en' } : undefined;
}

function tail(result, lines) {
  const text = (result.stdout + '\n' + result.stderr).trim();
  const split = text.split('\n');
  return split.slice(-lines).join('\n');
}

/**
 * Parse the Microsoft.Testing.Platform summary block.
 *
 * MTP prints CSI colour sequences even when `NO_COLOR=1`, so the labels are often
 * `\x1b[m  total: 23` rather than `  total: 23`. Counting on a line that starts with
 * the label would treat a real run as zero tests, which this stage refuses as evidence.
 * Exported so the ANSI case is tested without standing up `dotnet test`.
 */
export function extractTestSummary(output) {
  const plain = stripAnsi(output);
  const number = (label) => Number(new RegExp(`^\\s*${label}:\\s*(\\d+)`, 'm').exec(plain)?.[1] ?? '0');

  return {
    total: number('total'),
    succeeded: number('succeeded'),
    skipped: number('skipped'),
    failed: number('failed'),
  };
}

/** CSI SGR sequences (`ESC[…m` and kin). MTP's colouring is this form. */
function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}
