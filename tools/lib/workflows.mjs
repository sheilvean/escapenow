/**
 * Validation of the GitHub Actions workflows.
 *
 * Two layers, because they answer different questions.
 *
 * `actionlint` (as WASM, MIT, no binary download and no network at check time) answers "is this
 * valid?" — expression syntax, action reference format, shell issues, context availability.
 *
 * The policy checks below answer "does this do what the repository claims it does?" SECURITY.md
 * and docs/github-setup.md make specific promises: least-privilege permissions, actions pinned by
 * SHA, no `pull_request_target`, stable required check names, and an aggregate that cannot go
 * green when a required job was skipped. A promise in a document that nothing verifies is a
 * promise that has already drifted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** @typedef {{level: 'error'|'info', file: string, message: string}} Finding */

const WORKFLOW_DIR = path.join('.github', 'workflows');

/**
 * Required check names, as documented in docs/github-setup.md. These are an interface: a ruleset
 * refers to them by name, so renaming one silently stops a required check from being required.
 */
export const REQUIRED_CHECKS = {
  'pr.yml': {
    aggregate: 'required',
    jobs: ['checks', 'dependency-scan', 'secret-scan', 'archive-gate'],
  },
};

/** Actions allowed at all, pinned by SHA. Anything else needs a decision, not a commit. */
const ALLOWED_ACTIONS = new Set([
  'actions/checkout',
  'actions/setup-node',
  'actions/setup-dotnet',
  'actions/upload-artifact',
]);

export function workflowFiles(root) {
  const dir = path.join(root, WORKFLOW_DIR);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map((f) => ({ name: f, relative: `${WORKFLOW_DIR.split(path.sep).join('/')}/${f}` }));
}

/**
 * Run actionlint over every workflow.
 *
 * @returns {Promise<Finding[]>}
 */
export async function runActionlint(root) {
  const files = workflowFiles(root);
  if (files.length === 0) {
    return [{ level: 'error', file: WORKFLOW_DIR, message: 'contains no workflow files.' }];
  }

  let createLinter;
  try {
    ({ createLinter } = await import('actionlint'));
  } catch (error) {
    return [
      {
        level: 'error',
        file: WORKFLOW_DIR,
        message:
          'actionlint is not installed, so the workflows were not linted. Run `npm ci`. ' +
          `(${error.message})`,
      },
    ];
  }

  const findings = [];

  for (const { relative } of files) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');

    // A fresh linter per file, deliberately. Reusing one instance across calls crashes the WASM
    // module with `RuntimeError: unreachable` — content-dependent, so it looks like it works
    // until a particular workflow triggers it. Do not "optimize" this back into a shared
    // instance; instantiating costs milliseconds and a crashed linter reports nothing.
    let lint;
    try {
      lint = await createLinter();
    } catch (error) {
      findings.push({
        level: 'error',
        file: relative,
        message: `actionlint could not be instantiated, so this file was not linted: ${error.message}`,
      });
      continue;
    }

    let results;
    try {
      results = lint(text, relative);
    } catch (error) {
      // Reported as a failure, never silently as "no findings": an unlinted workflow is unchecked.
      findings.push({
        level: 'error',
        file: relative,
        message:
          `actionlint crashed while linting this file, so it is unchecked rather than clean: ` +
          `${error.message}`,
      });
      continue;
    }

    for (const result of results) {
      findings.push({
        level: 'error',
        file: `${relative}:${result.line}:${result.column}`,
        message: `[${result.kind}] ${result.message}`,
      });
    }
  }

  return findings;
}

/**
 * Check the safety properties the repository documents.
 *
 * @returns {Finding[]}
 */
export function checkWorkflowPolicy(root) {
  const findings = [];
  const files = workflowFiles(root);

  if (files.length === 0) {
    findings.push({ level: 'error', file: WORKFLOW_DIR, message: 'contains no workflow files.' });
    return findings;
  }

  for (const { name, relative } of files) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');

    let workflow;
    try {
      workflow = parseYaml(text);
    } catch (error) {
      findings.push({ level: 'error', file: relative, message: `is not valid YAML: ${error.message}` });
      continue;
    }

    checkNoSecondImplementation(relative, workflow, findings);
    checkTriggers(relative, workflow, findings);
    checkPermissions(relative, workflow, findings);
    checkPinnedActions(relative, text, workflow, findings);
    checkNoSecretsForForks(relative, text, findings);
    checkTimeouts(relative, workflow, findings);
    checkAggregate(name, relative, workflow, findings);
    checkGitFetchDepth(relative, workflow, findings);
  }

  checkDocumentedNamesExist(root, files, findings);

  return findings;
}

function jobs(workflow) {
  return Object.entries(workflow?.jobs ?? {});
}

/**
 * Commands a workflow step may invoke.
 *
 * ADR 0005's claim is that CI calls the repository's own entry points rather than reimplementing
 * any rule in YAML. That is checkable: a `run:` step may set up the toolchain, call a script under
 * `tools/`, or perform work that has nowhere else to live (the dependency and secret scans, and
 * the aggregate's own result assertion). A step that started running `dotnet test` directly, or a
 * second copy of a check written in bash, would be the drift this rule exists to catch.
 */
const ALLOWED_STEP_COMMANDS = [
  /^npm ci$/,
  /^npm audit\b/,
  /^dotnet restore$/,
  /^dotnet list package\b/,
  /^node tools\/[\w./-]+\.mjs\b/,
];

/** Steps whose script is inherently CI plumbing rather than a check. */
const PLUMBING_STEP_NAMES = new Set([
  'Assert every required job succeeded',
  'Download and verify gitleaks',
  'Scan',
  'NuGet vulnerabilities',
  'Node vulnerabilities',
  'Fetch the base ref',
  'Report',
]);

function checkNoSecondImplementation(relative, workflow, findings) {
  for (const [jobName, job] of jobs(workflow)) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.run !== 'string') continue;
      if (PLUMBING_STEP_NAMES.has(step.name)) continue;

      // A single-line step is a command; a multi-line one is a script, and a script that is not
      // named plumbing is a second implementation waiting to happen.
      const lines = step.run
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

      if (lines.length > 1) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `job "${jobName}" has a multi-line script that is not one of the named plumbing ` +
            'steps. Logic in a workflow is a second implementation of a rule; put it behind a ' +
            'tools/ entry point so a local run and a CI run mean the same thing.',
        });
        continue;
      }

      const command = lines[0] ?? '';

      // The allow list matches a prefix, so a chained command would otherwise slip past it:
      // `node tools/repo.mjs check && dotnet test ...` starts with an approved entry point and
      // then does something else. A single non-plumbing step runs one command.
      if (/(\|\||&&|;|\||>|<|\$\()/.test(command)) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `job "${jobName}" runs "${command}", which chains or redirects. A step that is not ` +
            'named plumbing runs exactly one command, so an approved prefix cannot carry ' +
            'something else behind it.',
        });
        continue;
      }

      if (!ALLOWED_STEP_COMMANDS.some((pattern) => pattern.test(command))) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `job "${jobName}" runs "${command}", which is not a repository entry point. CI must ` +
            'call the same commands a contributor does — see docs/adr/0005-one-check-entry-point.md.',
        });
      }
    }
  }
}

/**
 * checkout's `fetch-depth: 0` means unlimited history. git's `--depth=0` is invalid and fails
 * the job with `fatal: depth 0 is not a positive number`. The fetch of the PR base ref must
 * omit `--depth` to get the same "full history" effect.
 */
function checkGitFetchDepth(relative, workflow, findings) {
  for (const [jobName, job] of jobs(workflow)) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.run !== 'string') continue;
      if (/\bgit\s+fetch\b/.test(step.run) && /--depth=0\b/.test(step.run)) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `job "${jobName}" runs git fetch with --depth=0, which git rejects. checkout's ` +
            'fetch-depth: 0 means unlimited history; git fetch omits --depth for that effect.',
        });
      }
    }
  }
}

function checkTriggers(relative, workflow, findings) {
  // `on` is a YAML 1.1 boolean, so a parser may hand it back as the key `true`. Accept both.
  const on = workflow?.on ?? workflow?.[true];

  if (on === undefined) {
    findings.push({ level: 'error', file: relative, message: 'declares no triggers.' });
    return;
  }

  const triggerNames = Array.isArray(on) ? on : typeof on === 'string' ? [on] : Object.keys(on);

  if (triggerNames.includes('pull_request_target')) {
    findings.push({
      level: 'error',
      file: relative,
      message:
        'uses pull_request_target, which runs with repository write access and secrets available ' +
        'to code from a fork. The template never does this.',
    });
  }

  const pullRequest = Array.isArray(on) ? null : on?.pull_request;
  if (pullRequest && typeof pullRequest === 'object') {
    const types = pullRequest.types ?? [];
    if (!types.includes('ready_for_review')) {
      findings.push({
        level: 'error',
        file: relative,
        message:
          'the pull_request trigger does not include ready_for_review, so a draft that becomes ' +
          'ready is not re-checked — and the archive gate is exactly the check a draft is ' +
          'allowed to fail.',
      });
    }
  }

  if (!Array.isArray(on) && !Object.hasOwn(on ?? {}, 'merge_group')) {
    findings.push({
      level: 'info',
      file: relative,
      message:
        'does not handle merge_group. If a merge queue is enabled, the checks would not run for ' +
        'the queued combination.',
    });
  }
}

function checkPermissions(relative, workflow, findings) {
  if (workflow?.permissions === undefined) {
    findings.push({
      level: 'error',
      file: relative,
      message:
        'declares no workflow-level permissions, so the job token gets the repository default — ' +
        'which may be read and write.',
    });
  } else if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })) {
    findings.push({
      level: 'info',
      file: relative,
      message:
        `declares workflow-level permissions ${JSON.stringify(workflow.permissions)}. The ` +
        'template grants only { contents: read }; anything wider needs a reason.',
    });
  }

  for (const [jobName, job] of jobs(workflow)) {
    if (job?.permissions === undefined) {
      findings.push({
        level: 'error',
        file: relative,
        message: `job "${jobName}" declares no permissions of its own; state them explicitly.`,
      });
    }
  }
}

function checkPinnedActions(relative, text, workflow, findings) {
  for (const [jobName, job] of jobs(workflow)) {
    for (const step of job?.steps ?? []) {
      const uses = step?.uses;
      if (typeof uses !== 'string') continue;

      const [reference, ref] = uses.split('@');

      if (!ALLOWED_ACTIONS.has(reference)) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `job "${jobName}" uses the action "${reference}", which is not on the reviewed list ` +
            `(${[...ALLOWED_ACTIONS].join(', ')}). Adding one is a supply-chain decision.`,
        });
      }

      if (!/^[0-9a-f]{40}$/.test(ref ?? '')) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `job "${jobName}" pins "${reference}" to "${ref}", which is not a 40-character commit ` +
            'SHA. A tag can be moved.',
        });
        continue;
      }

      // The version comment is the only human-readable record of which release a SHA is.
      const pinLine = text
        .split('\n')
        .find((line) => line.includes(uses));
      if (pinLine && !/#\s*v\d/.test(pinLine)) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `the pin for "${reference}" has no "# vX.Y.Z" comment, so nobody can tell which ` +
            'release the SHA is without querying GitHub.',
        });
      }
    }
  }
}

function checkNoSecretsForForks(relative, text, findings) {
  // The template's jobs need no repository secret. If one appears, the fork question has to be
  // answered deliberately rather than by whoever added it.
  const matches = [...text.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'GITHUB_TOKEN');

  for (const name of new Set(matches)) {
    findings.push({
      level: 'error',
      file: relative,
      message:
        `references the repository secret "${name}". No job in this template needs one, and a ` +
        'pull request from a fork must never be able to reach it.',
    });
  }
}

function checkTimeouts(relative, workflow, findings) {
  for (const [jobName, job] of jobs(workflow)) {
    if (typeof job?.['timeout-minutes'] !== 'number') {
      findings.push({
        level: 'error',
        file: relative,
        message:
          `job "${jobName}" has no timeout-minutes, so a hung step burns the default 360 minutes.`,
      });
    }
  }
}

/**
 * The aggregate job is the one that makes "a skipped required job is not a pass" true, so it gets
 * the closest reading.
 */
function checkAggregate(name, relative, workflow, findings) {
  const expected = REQUIRED_CHECKS[name];
  if (!expected) return;

  const all = Object.fromEntries(jobs(workflow));

  for (const jobName of expected.jobs) {
    if (!Object.hasOwn(all, jobName)) {
      findings.push({
        level: 'error',
        file: relative,
        message:
          `does not define the job "${jobName}", which docs/github-setup.md lists as a required ` +
          'check. A ruleset naming it would wait forever.',
      });
    }
  }

  const aggregate = all[expected.aggregate];
  if (!aggregate) {
    findings.push({
      level: 'error',
      file: relative,
      message: `does not define the aggregate job "${expected.aggregate}".`,
    });
    return;
  }

  // Without `if: always()` the aggregate is itself skipped when a dependency fails, and a skipped
  // required check can read as neutral rather than failing.
  if (aggregate.if !== true && String(aggregate.if).trim() !== 'always()') {
    findings.push({
      level: 'error',
      file: relative,
      message:
        `the aggregate job "${expected.aggregate}" must be guarded by \`if: always()\`, or it is ` +
        `skipped whenever a dependency fails. Found: ${JSON.stringify(aggregate.if)}`,
    });
  }

  const needs = Array.isArray(aggregate.needs) ? aggregate.needs : [aggregate.needs].filter(Boolean);
  for (const jobName of expected.jobs) {
    if (!needs.includes(jobName)) {
      findings.push({
        level: 'error',
        file: relative,
        message: `the aggregate job does not need "${jobName}", so it cannot judge its result.`,
      });
    }
  }

  const script = (aggregate.steps ?? []).map((s) => s?.run ?? '').join('\n');
  const env = Object.assign({}, ...(aggregate.steps ?? []).map((s) => s?.env ?? {}));

  for (const jobName of expected.jobs) {
    const referenced =
      Object.values(env).some((value) => String(value).includes(`needs.${jobName}.result`)) ||
      script.includes(`needs.${jobName}.result`);

    if (!referenced) {
      findings.push({
        level: 'error',
        file: relative,
        message:
          `the aggregate job never reads needs.${jobName}.result, so that job's outcome does not ` +
          'affect the aggregate.',
      });
    }
  }

  if (!/exit\s+1/.test(script)) {
    findings.push({
      level: 'error',
      file: relative,
      message: 'the aggregate job never exits non-zero, so it cannot fail.',
    });
  }
}

/** Every required check name in the documentation must be a job that exists. */
function checkDocumentedNamesExist(root, files, findings) {
  const setupDoc = path.join(root, 'docs', 'github-setup.md');
  if (!fs.existsSync(setupDoc)) {
    findings.push({
      level: 'error',
      file: 'docs/github-setup.md',
      message: 'is missing, so the required check names are documented nowhere.',
    });
    return;
  }

  const text = fs.readFileSync(setupDoc, 'utf8');

  for (const { name } of files) {
    const expected = REQUIRED_CHECKS[name];
    if (!expected) continue;

    for (const jobName of [...expected.jobs, expected.aggregate]) {
      if (!text.includes(`\`${jobName}\``)) {
        findings.push({
          level: 'info',
          file: 'docs/github-setup.md',
          message:
            `does not mention the check name \`${jobName}\`. Whoever configures the ruleset ` +
            'reads that page.',
        });
      }
    }
  }
}
