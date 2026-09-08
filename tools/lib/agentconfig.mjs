/**
 * Validation of the Claude Code configuration.
 *
 * The agent's configuration travels through source control like any other code, and it decides
 * what the agent may do. So it is checked, not trusted: JSON and frontmatter must parse, every
 * referenced path must resolve, forbidden settings must be absent, declared hooks must exist, and
 * no secret may be committed.
 *
 * This is a set of checks over files. It is not a sandbox, and SECURITY.md says so plainly.
 */

import fs from 'node:fs';
import path from 'node:path';

/** @typedef {{level: 'error'|'info', message: string, file?: string}} Finding */

const CLAUDE_DIR = '.claude';

/** Settings that grant more than a repository file should be able to grant. */
const FORBIDDEN_SETTINGS = [
  {
    path: ['permissions', 'defaultMode'],
    reject: (v) => v === 'bypassPermissions' || v === 'auto' || v === 'dontAsk',
    message:
      'permissions.defaultMode must not be bypassPermissions, auto or dontAsk. ' +
      '(Claude Code ignores auto and bypassPermissions from project settings anyway, so setting ' +
      'them here would be a false sense of configuration as well as the wrong intent.)',
  },
  {
    path: ['enableAllProjectMcpServers'],
    reject: (v) => v === true,
    message:
      'enableAllProjectMcpServers must not be true: it trusts every server the project declares, ' +
      'including any added later by someone else.',
  },
  {
    path: ['permissions', 'allow'],
    reject: (v) => Array.isArray(v) && v.some((r) => r === '*' || r === 'Bash' || r === 'Bash(*)'),
    message:
      'permissions.allow must not contain a blanket rule ("*", "Bash", "Bash(*)"). ' +
      'Allow the commands the project actually needs.',
  },
];

/**
 * Path rules written for a tool Claude Code never consults for file permissions. Documented
 * behaviour: file access is matched only against Read(...) and Edit(...) rules; a path rule for
 * Write, NotebookEdit, MultiEdit or Glob is accepted and silently never applied.
 */
const INEFFECTIVE_PATH_RULE = /^(Write|NotebookEdit|MultiEdit|Glob)\s*\(/;

/** Literals that must not appear in reusable instructions. */
const FORBIDDEN_LITERALS = [
  {
    pattern: /\bclaude-(?:opus|sonnet|haiku|fable)-[\w.-]+/gi,
    message:
      'a hardcoded Claude model identifier. Agents inherit the model or take it from a central ' +
      'setting, so the repository does not pin a model per agent.',
  },
  {
    // Requires branch context around the name. An earlier version matched any line beginning
    // with the word, which flagged `main();` in tools/repo.mjs — a false positive that would
    // train people to ignore this check.
    pattern:
      /(?:git\s+(?:checkout|switch|merge|rebase|pull|push)\s+(?:origin\s+)?|origin\/|refs\/heads\/|\b(?:branch|baseRef|base_ref|head_ref|default_branch|targetBranch)\b\s*[:=]\s*['"`]?)(?:main|develop|master)\b/gi,
    message:
      'a hardcoded default branch name. The policy scope is configured and the branch context is ' +
      'detected from the CI event payload.',
  },
  {
    // The name as a string literal, which is how it reaches a comparison.
    //
    // Single and double quotes only. Backticks are excluded deliberately: in a comment or a
    // Markdown rule, `main` is prose *about* this very policy, and matching it made the check
    // flag the JSDoc in tools/lib/gate.mjs that explains the rule. A check that fires on its own
    // documentation teaches people to ignore it.
    pattern: /(['"])(?:main|develop|master)\1/g,
    message:
      'a default branch name as a literal. Detect the branch from the CI event payload instead.',
  },
  // A negative lookbehind, not `\b`. `\b` before a `/` or a drive letter only matches when the
  // preceding character is a word character — so `in /home/someone/` never matched, and this rule
  // silently checked nothing until a test was written for it. The lookbehind excludes the cases
  // that make a path relative (`src/home/x`, `a.b:/Users/...`) without requiring a word boundary.
  {
    pattern: /(?<![\w:])[A-Za-z]:[\\/]Users[\\/][A-Za-z0-9_.-]+/g,
    message: 'an absolute path inside a user profile.',
  },
  {
    pattern: /(?<![\w.-])\/(?:home|Users)\/[A-Za-z0-9_.-]+\//g,
    message: 'an absolute path inside a user profile.',
  },
  {
    pattern: /\b(?:Orders|Billing|Invoicing|Payments)\.(?:Domain|Application|Infrastructure|Api)\b/g,
    message:
      'an example domain module presented as a real one. Module names come from the registry in ' +
      'project.config.json.',
  },
];

/** Shapes that look like committed credentials. Deliberately narrow, to stay actionable. */
const SECRET_PATTERNS = [
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

/**
 * Paths whose contents are allowed to contain the forbidden literals: fixtures and tooling tests
 * exist precisely to exercise the detector, and the detector's own pattern list is not an instruction.
 */
const LITERAL_EXEMPT = [
  'tests/fixtures/',
  'tools/tests/',
  'tools/lib/agentconfig.mjs',
];

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}

function get(object, keys) {
  return keys.reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), object);
}

/** Split YAML frontmatter from a Markdown file. Returns null when there is none. */
export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;

  const end = text.indexOf('\n---', 3);
  if (end === -1) return { error: 'the frontmatter block is opened but never closed' };

  const block = text.slice(text.indexOf('\n') + 1, end);
  const fields = {};

  for (const [index, raw] of block.split('\n').entries()) {
    const line = raw.trimEnd();
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
    // Continuation lines of a block scalar or list belong to the previous key.
    if (/^\s/.test(line)) continue;

    const colon = line.indexOf(':');
    if (colon === -1) {
      return { error: `line ${index + 1} of the frontmatter is not "key: value": ${line}` };
    }
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  return { fields, body: text.slice(end + 4) };
}

/**
 * Run every agent-configuration check.
 *
 * @returns {Finding[]} Findings. `level: 'error'` fails the check; `level: 'info'` is reported
 *          without failing, and is used for states that are legitimately absent.
 */
export function validateAgentConfig(root) {
  /** @type {Finding[]} */
  const findings = [];

  const settingsPath = path.join(root, CLAUDE_DIR, 'settings.json');
  let settings = null;

  if (!fs.existsSync(settingsPath)) {
    findings.push({
      level: 'error',
      file: `${CLAUDE_DIR}/settings.json`,
      message: 'is missing, so the repository declares no permission boundaries at all.',
    });
  } else {
    try {
      settings = readJson(settingsPath);
    } catch (error) {
      findings.push({
        level: 'error',
        file: `${CLAUDE_DIR}/settings.json`,
        message: `is not valid JSON: ${error.message}`,
      });
    }
  }

  if (settings) {
    checkForbiddenSettings(settings, findings);
    checkPermissionRuleShapes(settings, findings);
    checkDeclaredHooks(root, settings, findings);
  }

  checkMcp(root, findings);
  checkRulePathScoping(root, findings);
  checkMarkdownFrontmatter(root, findings);
  checkClaudeMdReferences(root, findings);
  checkCommandsDoNotCollideWithSkills(root, findings);
  checkForbiddenLiterals(root, findings);
  checkSecrets(root, findings);

  return findings;
}

function checkForbiddenSettings(settings, findings) {
  for (const rule of FORBIDDEN_SETTINGS) {
    const value = get(settings, rule.path);
    if (value !== undefined && rule.reject(value)) {
      findings.push({
        level: 'error',
        file: `${CLAUDE_DIR}/settings.json`,
        message: rule.message,
      });
    }
  }

  if (!get(settings, ['permissions', 'deny'])) {
    findings.push({
      level: 'error',
      file: `${CLAUDE_DIR}/settings.json`,
      message: 'declares no permissions.deny list. Least privilege starts with explicit denials.',
    });
    return;
  }

  // The credential shapes a deny list must cover for the documented boundary to hold.
  const deny = get(settings, ['permissions', 'deny']).join('\n');
  const required = [
    { needle: '.env', what: 'environment files' },
    { needle: '.ssh', what: 'SSH keys' },
    { needle: 'curl', what: 'shell HTTP clients' },
  ];
  for (const { needle, what } of required) {
    if (!deny.includes(needle)) {
      findings.push({
        level: 'error',
        file: `${CLAUDE_DIR}/settings.json`,
        message: `permissions.deny does not cover ${what} (no rule mentioning "${needle}").`,
      });
    }
  }
}

function checkPermissionRuleShapes(settings, findings) {
  for (const kind of ['allow', 'deny', 'ask']) {
    for (const rule of get(settings, ['permissions', kind]) ?? []) {
      if (INEFFECTIVE_PATH_RULE.test(rule)) {
        findings.push({
          level: 'error',
          file: `${CLAUDE_DIR}/settings.json`,
          message:
            `permissions.${kind} contains "${rule}". Claude Code checks file access only against ` +
            'Read(...) and Edit(...) rules; a path rule for Write, NotebookEdit, MultiEdit or Glob ' +
            'is accepted and then never consulted. Use Edit(...) or Read(...) instead.',
        });
      }
    }
  }
}

function checkDeclaredHooks(root, settings, findings) {
  const hooks = settings.hooks ?? {};
  let declared = 0;

  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) {
      findings.push({
        level: 'error',
        file: `${CLAUDE_DIR}/settings.json`,
        message: `hooks.${event} must be an array of matcher objects.`,
      });
      continue;
    }

    for (const matcher of matchers) {
      for (const hook of matcher.hooks ?? []) {
        declared++;

        if (hook.type !== 'command') {
          findings.push({
            level: 'error',
            file: `${CLAUDE_DIR}/settings.json`,
            message:
              `hooks.${event} declares a hook of type "${hook.type}". This template only ships ` +
              'command hooks, so anything else is unreviewed configuration.',
          });
          continue;
        }

        if (typeof hook.timeout !== 'number') {
          findings.push({
            level: 'error',
            file: `${CLAUDE_DIR}/settings.json`,
            message:
              `hooks.${event} declares a command hook without an explicit timeout. The default is ` +
              '600 seconds, which is far too long for the fast feedback these hooks provide.',
          });
        }

        const resolved = resolveHookCommand(root, hook);
        if (resolved && !fs.existsSync(resolved.file)) {
          findings.push({
            level: 'error',
            file: `${CLAUDE_DIR}/settings.json`,
            message:
              `hooks.${event} declares the script "${resolved.relative}", which does not exist. ` +
              'A hook that cannot run is configuration that looks like protection.',
          });
        }
      }
    }
  }

  if (declared === 0) {
    findings.push({
      level: 'info',
      file: `${CLAUDE_DIR}/settings.json`,
      message: 'declares no hooks.',
    });
  }
}

/**
 * Resolve the script a command hook runs. Handles `${CLAUDE_PROJECT_DIR}` and picks the first
 * argument that looks like a repository path, which is how the template's hooks are written.
 */
function resolveHookCommand(root, hook) {
  const candidates = [hook.command, ...(hook.args ?? [])].filter((c) => typeof c === 'string');

  for (const candidate of candidates) {
    const expanded = candidate.replaceAll('${CLAUDE_PROJECT_DIR}', root);
    if (!/\.(mjs|cjs|js|sh|ps1)$/.test(expanded)) continue;

    const absolute = path.isAbsolute(expanded) ? expanded : path.join(root, expanded);
    return { file: absolute, relative: toRelative(root, absolute) };
  }

  return null;
}

function toRelative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function checkMcp(root, findings) {
  const mcpPath = path.join(root, '.mcp.json');

  if (!fs.existsSync(mcpPath)) {
    findings.push({
      level: 'error',
      file: '.mcp.json',
      message: 'is missing. The template ships it with no servers so the shape is reviewed up front.',
    });
    return;
  }

  let mcp;
  try {
    mcp = readJson(mcpPath);
  } catch (error) {
    findings.push({ level: 'error', file: '.mcp.json', message: `is not valid JSON: ${error.message}` });
    return;
  }

  const servers = Object.keys(mcp.mcpServers ?? {});
  if (servers.length > 0) {
    findings.push({
      level: 'info',
      file: '.mcp.json',
      message:
        `declares ${servers.length} server(s): ${servers.join(', ')}. Confirm each was an ` +
        'explicit opt-in and that its secrets come from outside the repository.',
    });
  }

  const raw = fs.readFileSync(mcpPath, 'utf8');
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(raw)) {
      findings.push({
        level: 'error',
        file: '.mcp.json',
        message: `appears to contain a ${name}. Secrets belong in an external mechanism.`,
      });
    }
  }
}

/**
 * Rules that apply to a subset of the repository must say so.
 *
 * A rule without `paths:` is loaded into every session whether or not the task touches what it
 * covers, and context spent on an irrelevant rule is context not spent on the task. The
 * language- and profile-specific directories are exactly the ones that have a natural scope, so
 * they are required to declare one; `common/` legitimately applies everywhere.
 */
function checkRulePathScoping(root, findings) {
  const scopedDirectories = ['dotnet', 'architecture'];

  for (const directory of scopedDirectories) {
    const pattern = `${CLAUDE_DIR}/rules/${directory}/**/*.md`;

    for (const match of fs.globSync(pattern, { cwd: root })) {
      const relative = match.split(path.sep).join('/');
      const text = fs.readFileSync(path.join(root, relative), 'utf8');
      const parsed = parseFrontmatter(text);

      if (parsed === null || parsed.error) {
        // Reported by the frontmatter check; do not report it twice.
        continue;
      }

      if (!Object.hasOwn(parsed.fields, 'paths')) {
        findings.push({
          level: 'error',
          file: relative,
          message:
            `is in ${CLAUDE_DIR}/rules/${directory}/, which applies to a subset of the ` +
            'repository, but declares no `paths:` scope. It would be loaded into every session. ' +
            'Add a paths scope, or move it to rules/common/ if it really applies everywhere.',
        });
      }
    }
  }
}

/** Skills and agents: frontmatter must parse and declare what makes them usable. */
function checkMarkdownFrontmatter(root, findings) {
  const skillFiles = fs
    .globSync(`${CLAUDE_DIR}/skills/*/SKILL.md`, { cwd: root })
    .map((p) => p.split(path.sep).join('/'));

  const agentFiles = fs
    .globSync(`${CLAUDE_DIR}/agents/*.md`, { cwd: root })
    .map((p) => p.split(path.sep).join('/'));

  for (const relative of [...skillFiles, ...agentFiles]) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    const parsed = parseFrontmatter(text);

    if (parsed === null) {
      findings.push({ level: 'error', file: relative, message: 'has no YAML frontmatter block.' });
      continue;
    }
    if (parsed.error) {
      findings.push({ level: 'error', file: relative, message: `has unparseable frontmatter: ${parsed.error}` });
      continue;
    }
    if (!parsed.fields.description) {
      findings.push({
        level: 'error',
        file: relative,
        message: 'declares no description, so nothing tells the agent when it applies.',
      });
    }
  }

  checkReviewAgentsCannotWrite(root, agentFiles, findings);
}

/** Review agents must not be able to edit files or deploy. */
function checkReviewAgentsCannotWrite(root, agentFiles, findings) {
  const writeCapable = ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'];

  for (const relative of agentFiles) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    const parsed = parseFrontmatter(text);
    if (!parsed?.fields) continue;

    const tools = (parsed.fields.tools ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (tools.length === 0) {
      findings.push({
        level: 'error',
        file: relative,
        message:
          'declares no tools list, so it inherits every tool available — including file writes. ' +
          'A review agent must name the tools it needs.',
      });
      continue;
    }

    const offending = tools.filter((t) => writeCapable.some((w) => t === w || t.startsWith(`${w}(`)));
    if (offending.length > 0) {
      findings.push({
        level: 'error',
        file: relative,
        message:
          `declares file-writing tools (${offending.join(', ')}). Review agents report; they do ` +
          'not change the code they are reviewing.',
      });
    }
  }
}

/** Every repository path CLAUDE.md points at must exist. */
function checkClaudeMdReferences(root, findings) {
  const claudeMd = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) {
    findings.push({ level: 'error', file: 'CLAUDE.md', message: 'is missing.' });
    return;
  }

  const text = fs.readFileSync(claudeMd, 'utf8');
  const referenced = new Set();

  // Backtick-quoted paths that look like repository paths.
  for (const match of text.matchAll(/`([A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]*)`/g)) {
    const candidate = match[1];
    if (candidate.startsWith('http') || candidate.includes('://')) continue;
    // Brace expansions and globs describe a family of paths, not one path.
    if (/[*{}]/.test(candidate)) continue;
    referenced.add(candidate.replace(/\/$/, ''));
  }

  for (const candidate of [...referenced].sort()) {
    if (!fs.existsSync(path.join(root, candidate))) {
      findings.push({
        level: 'error',
        file: 'CLAUDE.md',
        message: `references \`${candidate}\`, which does not exist.`,
      });
    }
  }
}

/** A command must not shadow a skill of the same name. */
function checkCommandsDoNotCollideWithSkills(root, findings) {
  const skills = new Set(
    fs
      .globSync(`${CLAUDE_DIR}/skills/*/SKILL.md`, { cwd: root })
      .map((p) => p.split(path.sep).join('/').split('/').at(-2))
  );

  const commands = fs
    .globSync(`${CLAUDE_DIR}/commands/**/*.md`, { cwd: root })
    .map((p) => p.split(path.sep).join('/'));

  for (const relative of commands) {
    const name = path.basename(relative, '.md');
    // OpenSpec's generated commands live under commands/opsx/ and pair with its own skills by
    // design; the collision rule is about the template's own thin entry points.
    if (relative.startsWith(`${CLAUDE_DIR}/commands/opsx/`)) continue;

    if (skills.has(name)) {
      findings.push({
        level: 'error',
        file: relative,
        message:
          `has the same name as the skill ${CLAUDE_DIR}/skills/${name}/. Skills override ` +
          'same-named commands, so one of them would silently never run.',
      });
    }
  }
}

/** Reusable instructions must not carry an application's identity or an imposed choice. */
function checkForbiddenLiterals(root, findings) {
  const files = [
    'CLAUDE.md',
    ...fs.globSync(`${CLAUDE_DIR}/rules/**/*.md`, { cwd: root }),
    ...fs.globSync(`${CLAUDE_DIR}/skills/repo-*/SKILL.md`, { cwd: root }),
    ...fs.globSync(`${CLAUDE_DIR}/agents/*.md`, { cwd: root }),
    ...fs.globSync('tools/**/*.mjs', { cwd: root }),
  ].map((p) => p.split(path.sep).join('/'));

  for (const relative of [...new Set(files)].sort()) {
    if (LITERAL_EXEMPT.some((prefix) => relative.startsWith(prefix))) continue;

    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) continue;

    const text = fs.readFileSync(absolute, 'utf8');

    for (const { pattern, message } of FORBIDDEN_LITERALS) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length;
        findings.push({
          level: 'error',
          file: `${relative}:${line}`,
          message: `contains ${message} Matched: "${match[0].trim()}"`,
        });
      }
    }
  }
}

/** No committed secret anywhere the agent configuration lives. */
function checkSecrets(root, findings) {
  const files = [
    ...fs.globSync(`${CLAUDE_DIR}/**/*`, { cwd: root }),
    ...fs.globSync('tools/**/*.mjs', { cwd: root }),
    '.mcp.json',
    'CLAUDE.md',
  ].map((p) => p.split(path.sep).join('/'));

  for (const relative of [...new Set(files)].sort()) {
    if (LITERAL_EXEMPT.some((prefix) => relative.startsWith(prefix))) continue;

    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;

    const text = fs.readFileSync(absolute, 'utf8');
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        // The value itself is never printed, so the finding does not leak what it found.
        findings.push({
          level: 'error',
          file: relative,
          message: `appears to contain a ${name}. Remove it and rotate the credential.`,
        });
      }
    }
  }
}
