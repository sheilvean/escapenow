#!/usr/bin/env node
/**
 * PreToolUse hook: note when a protected configuration file is about to change.
 *
 * Advisory only. It emits no `permissionDecision`, so it neither allows nor denies anything — the
 * edit proceeds through the normal permission flow either way. Calling this protection would be a
 * lie: a list of paths in a hook is a reminder, and anything that means to change these files can.
 *
 * What actually constrains an edit here is `permissions.ask` in `.claude/settings.json`, which
 * prompts the human. This hook adds the reason the file matters, which a permission prompt cannot.
 *
 * See SECURITY.md for the boundary and the residual risk. Without CODEOWNERS and branch
 * protection — omitted by the repository owner's decision, recorded in docs/adr/0006 — nothing
 * downstream requires an owner's review of these files either.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Protected paths and why. The reason is the point: "this file is protected" tells the reader
 * nothing they can act on.
 */
const PROTECTED = [
  {
    match: (p) => p === '.claude/settings.json',
    why: 'it holds the permission rules and the hook registrations — the agent\'s own boundaries.',
  },
  {
    match: (p) => p === '.mcp.json',
    why: 'it decides which external servers the agent may talk to.',
  },
  {
    match: (p) => p.startsWith('.claude/hooks/'),
    why: 'a hook runs automatically on every matching action.',
  },
  {
    match: (p) => p.startsWith('.claude/agents/'),
    why: 'it defines what a subagent is allowed to do.',
  },
  {
    match: (p) => p.startsWith('.github/workflows/'),
    why: 'CI is the independent check; a change here changes what "green" means.',
  },
  {
    match: (p) => p.startsWith('tools/'),
    why: 'this is the tooling every check runs through, including the archive gate.',
  },
  {
    match: (p) => /ArchitectureTests\/Support\/(LayeredProfile|RuleGuard)\.cs$/.test(p),
    why:
      'it defines the architecture rules themselves. Weakening one needs an ADR, not an edit — ' +
      'and a negative fixture test will fail if a rule stops detecting its violation.',
  },
  {
    match: (p) => p.startsWith('tests/fixtures/'),
    why:
      'these fixtures are what prove the architecture rules detect violations. Emptying one ' +
      'silently disables that proof.',
  },
  {
    match: (p) => p === 'project.config.json',
    why: 'it drives the architecture rules, the check pipeline and the archive gate policy.',
  },
  {
    match: (p) => p === 'global.json' || p === 'Directory.Packages.props',
    why: 'it pins the toolchain and the dependency versions for everyone.',
  },
];

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

function relativeTarget(payload) {
  const candidate = payload?.tool_input?.file_path;
  if (typeof candidate !== 'string' || candidate.length === 0) return null;

  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const relative = path.relative(root, path.resolve(root, candidate));

  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

function main() {
  const target = relativeTarget(readPayload());
  if (!target) process.exit(0);

  const matched = PROTECTED.find((entry) => entry.match(target));
  if (!matched) process.exit(0);

  // No permissionDecision: this is a note, not a gate.
  process.stdout.write(
    JSON.stringify({
      systemMessage:
        `Note: \`${target}\` is a protected configuration file — ${matched.why}\n` +
        'If this change is part of the approved contract, continue. If it is a way around a ' +
        'failing check or a permission prompt, stop and ask the human instead.\n' +
        '(This is advisory. It does not block the edit; see SECURITY.md.)',
    }) + '\n'
  );

  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
