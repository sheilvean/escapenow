/**
 * The agent-configuration validator.
 *
 * The `agent-config` stage decides whether the agent's own boundaries are sound, and it reports no
 * findings on this repository. That sentence is only worth something if each rule has been seen to
 * fire — otherwise "no findings" and "the rule checks nothing" look identical, which is the exact
 * failure mode the negative architecture fixtures exist to prevent, one layer up.
 *
 * So every rule gets a case that breaks it. Each case starts from a copy of the real `.claude/`
 * tree and changes one thing, so a failure points at the rule rather than at the fixture.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, validateAgentConfig } from '../lib/agentconfig.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'agentconfig-tests');

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

/**
 * A copy of the repository's agent configuration, with one mutation applied.
 *
 * Only what the validator reads is copied: `.claude/`, `CLAUDE.md` and the paths
 * CLAUDE.md points at. The last part matters — the reference-path rule would otherwise fire on
 * every case and drown out the one under test.
 */
/** Directories that are never worth copying into a fixture: regenerable, and enormous. */
const UNCOPYABLE = new Set(['node_modules', 'artifacts', 'dist', '.git', 'obj', 'bin']);

/** cpSync filter: skip a dependency or build directory anywhere in the tree. */
const copyable = (source) => !UNCOPYABLE.has(path.basename(source));

function mutated(name, mutate) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });

  fs.cpSync(path.join(ROOT, '.claude'), path.join(repo, '.claude'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'CLAUDE.md'), path.join(repo, 'CLAUDE.md'));

  // Every path CLAUDE.md references, so the reference check has something to resolve.
  const claudeMd = fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8');
  for (const match of claudeMd.matchAll(/`([A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]*)`/g)) {
    const candidate = match[1].replace(/\/$/, '');
    if (candidate.startsWith('http') || /[*{}]/.test(candidate)) continue;

    const source = path.join(ROOT, candidate);
    const destination = path.join(repo, candidate);
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    // The reference check only needs the path to exist, so dependency and build directories are
    // skipped. Without this, a referenced directory that happens to contain node_modules is
    // copied in full for every case — `frontend/` alone is over half a million files, which
    // turns this suite from seconds into hours.
    fs.cpSync(source, destination, { recursive: true, filter: copyable });
  }

  mutate(repo);
  return repo;
}

const errorsFor = (repo) => validateAgentConfig(repo).filter((f) => f.level === 'error');

const readSettings = (repo) =>
  JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8'));

const writeSettings = (repo, settings) =>
  fs.writeFileSync(
    path.join(repo, '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2),
    'utf8'
  );

describe('the repository itself satisfies every rule', () => {
  test('no errors on the real configuration', () => {
    const errors = errorsFor(ROOT);

    assert.deepEqual(
      errors,
      [],
      'errors:\n' + errors.map((f) => `  ${f.file} ${f.message}`).join('\n')
    );
  });

  test('an unmutated copy is also clean, so each case below differs in one respect', () => {
    // Guards the fixture, not the validator. If the copy were incomplete, every negative case
    // would "pass" for the wrong reason.
    const repo = mutated('reference', () => {});
    const errors = errorsFor(repo);

    assert.deepEqual(
      errors,
      [],
      'the unmutated copy should be clean:\n' + errors.map((f) => `  ${f.file} ${f.message}`).join('\n')
    );
  });
});

describe('each rule fires on a configuration that breaks it', () => {
  const cases = [
    // checkForbiddenSettings
    [
      'a bypass permission mode',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.defaultMode = 'bypassPermissions';
        writeSettings(repo, s);
      },
      /must not be bypassPermissions/,
    ],
    [
      'auto as the default mode',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.defaultMode = 'auto';
        writeSettings(repo, s);
      },
      /must not be bypassPermissions, auto or dontAsk/,
    ],
    [
      'trusting every project MCP server',
      (repo) => {
        const s = readSettings(repo);
        s.enableAllProjectMcpServers = true;
        writeSettings(repo, s);
      },
      /enableAllProjectMcpServers must not be true/,
    ],
    [
      'a blanket allow rule',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.allow.push('Bash(*)');
        writeSettings(repo, s);
      },
      /must not contain a blanket rule/,
    ],
    [
      'no deny list at all',
      (repo) => {
        const s = readSettings(repo);
        delete s.permissions.deny;
        writeSettings(repo, s);
      },
      /declares no permissions\.deny list/,
    ],
    [
      'a deny list that does not cover environment files',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.deny = s.permissions.deny.filter((r) => !r.includes('.env'));
        writeSettings(repo, s);
      },
      /does not cover environment files/,
    ],
    [
      'a deny list that does not cover shell HTTP clients',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.deny = s.permissions.deny.filter((r) => !r.includes('curl'));
        writeSettings(repo, s);
      },
      /does not cover shell HTTP clients/,
    ],

    // checkProtectedConfigIsBehindAsk
    [
      'a protected configuration file dropped from the ask list',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.ask = s.permissions.ask.filter((r) => r !== 'Edit(project.config.json)');
        writeSettings(repo, s);
      },
      /permissions\.ask does not cover "project\.config\.json"/,
    ],
    [
      'no ask list at all',
      (repo) => {
        const s = readSettings(repo);
        delete s.permissions.ask;
        writeSettings(repo, s);
      },
      /declares no permissions\.ask list/,
    ],

    // checkPermissionRuleShapes
    [
      'a path rule written for Write, which Claude Code never consults',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.deny.push('Write(secrets/**)');
        writeSettings(repo, s);
      },
      /never consulted/,
    ],
    [
      'a path rule written for Glob',
      (repo) => {
        const s = readSettings(repo);
        s.permissions.allow.push('Glob(docs/**)');
        writeSettings(repo, s);
      },
      /never consulted/,
    ],

    // checkDeclaredHooks
    [
      'a hook whose script does not exist',
      (repo) => {
        const s = readSettings(repo);
        s.hooks.Stop[0].hooks[0].args = ['${CLAUDE_PROJECT_DIR}/.claude/hooks/gone.mjs'];
        writeSettings(repo, s);
      },
      /which does not exist/,
    ],
    [
      'a hook with no explicit timeout',
      (repo) => {
        const s = readSettings(repo);
        delete s.hooks.Stop[0].hooks[0].timeout;
        writeSettings(repo, s);
      },
      /without an explicit timeout/,
    ],
    [
      'a hook of a type the template does not ship',
      (repo) => {
        const s = readSettings(repo);
        s.hooks.Stop[0].hooks[0].type = 'prompt';
        writeSettings(repo, s);
      },
      /declares a hook of type "prompt"/,
    ],

    // checkRulePathScoping
    [
      'a language-specific rule with no paths scope',
      (repo) => {
        const file = path.join(repo, '.claude', 'rules', 'dotnet', 'testing.md');
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text.replace(/^paths:\n(?:  - .*\n)+/m, ''), 'utf8');
      },
      /declares no `paths:` scope/,
    ],

    // checkMarkdownFrontmatter
    [
      'a skill with unparseable frontmatter',
      (repo) => {
        const file = path.join(repo, '.claude', 'skills', 'repo-check', 'SKILL.md');
        fs.writeFileSync(file, '---\nthis line has no colon\n---\nbody\n', 'utf8');
      },
      /unparseable frontmatter/,
    ],
    [
      'a skill with no frontmatter at all',
      (repo) => {
        const file = path.join(repo, '.claude', 'skills', 'repo-review', 'SKILL.md');
        fs.writeFileSync(file, '# Just a heading\n', 'utf8');
      },
      /has no YAML frontmatter/,
    ],
    [
      'a skill with no description',
      (repo) => {
        const file = path.join(repo, '.claude', 'skills', 'repo-check', 'SKILL.md');
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text.replace(/^description: .*$/m, 'name: repo-check'), 'utf8');
      },
      /declares no description/,
    ],

    // checkReviewAgentsCannotWrite
    [
      'a review agent that can write files',
      (repo) => {
        const file = path.join(repo, '.claude', 'agents', 'code-reviewer.md');
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text.replace(/^tools: .*$/m, 'tools: Read, Grep, Edit'), 'utf8');
      },
      /declares file-writing tools/,
    ],
    [
      'a review agent with no tools list, inheriting everything',
      (repo) => {
        const file = path.join(repo, '.claude', 'agents', 'architecture-reviewer.md');
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text.replace(/^tools: .*$/m, 'color: purple'), 'utf8');
      },
      /declares no tools list/,
    ],

    // checkForbiddenLiterals
    [
      'a hardcoded Claude model identifier',
      (repo) => {
        const file = path.join(repo, '.claude', 'agents', 'code-reviewer.md');
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text.replace(/^model: inherit$/m, 'model: claude-opus-4-1'), 'utf8');
      },
      /hardcoded Claude model identifier/,
    ],
    [
      'a hardcoded default branch name',
      (repo) => {
        const file = path.join(repo, '.claude', 'rules', 'common', 'workflow.md');
        fs.appendFileSync(file, '\nAlways rebase onto origin/main before pushing.\n', 'utf8');
      },
      /hardcoded default branch name/,
    ],
    [
      'a branch name as a string literal',
      (repo) => {
        const file = path.join(repo, '.claude', 'rules', 'common', 'workflow.md');
        fs.appendFileSync(file, '\nconst base = "main";\n', 'utf8');
      },
      /as a literal/,
    ],
    [
      'an absolute POSIX path inside a user profile',
      (repo) => {
        const file = path.join(repo, '.claude', 'rules', 'common', 'quality.md');
        fs.appendFileSync(file, '\nLogs are in /home/somebody/logs/.\n', 'utf8');
      },
      /absolute path inside a user profile/,
    ],
    [
      'an absolute Windows path inside a user profile',
      (repo) => {
        // Built from a char code so no source-level escaping can quietly change what is written.
        const backslash = String.fromCharCode(92);
        const file = path.join(repo, '.claude', 'rules', 'common', 'quality.md');
        fs.appendFileSync(
          file,
          `\nThe checkout is at C:${backslash}Users${backslash}somebody${backslash}project.\n`,
          'utf8'
        );
      },
      /absolute path inside a user profile/,
    ],
    [
      'a relative path that merely contains "home" is not flagged',
      (repo) => {
        // The complement of the rule above. One that fired on src/home/x would be unusable.
        const file = path.join(repo, '.claude', 'rules', 'common', 'quality.md');
        fs.appendFileSync(file, '\nLayout lives under src/home/widgets/.\n', 'utf8');
      },
      null,
    ],

    // checkSecrets
    [
      'a committed AWS access key id',
      (repo) => {
        const file = path.join(repo, '.claude', 'rules', 'common', 'quality.md');
        fs.appendFileSync(file, '\nAKIAIOSFODNN7EXAMPLE\n', 'utf8');
      },
      /appears to contain a AWS access key id/,
    ],
    [
      'a committed private key block',
      (repo) => {
        const file = path.join(repo, '.claude', 'rules', 'common', 'security.md');
        fs.appendFileSync(file, '\n-----BEGIN RSA PRIVATE KEY-----\n', 'utf8');
      },
      /private key block/,
    ],

    // checkClaudeMdReferences
    [
      'CLAUDE.md pointing at a path that does not exist',
      (repo) => {
        const file = path.join(repo, 'CLAUDE.md');
        fs.appendFileSync(file, '\nSee `docs/does-not-exist.md` for details.\n', 'utf8');
      },
      /which does not exist/,
    ],
    [
      'a missing CLAUDE.md',
      (repo) => fs.rmSync(path.join(repo, 'CLAUDE.md')),
      /is missing/,
    ],

    // checkCommandsDoNotCollideWithSkills
    [
      'a command whose name shadows a skill',
      (repo) => {
        const dir = path.join(repo, '.claude', 'commands');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'repo-check.md'), '---\nname: x\n---\nbody\n', 'utf8');
      },
      /same name as the skill/,
    ],

    // Missing settings entirely.
    [
      'a missing settings file',
      (repo) => fs.rmSync(path.join(repo, '.claude', 'settings.json')),
      /declares no permission boundaries/,
    ],
    [
      'settings that are not valid JSON',
      (repo) =>
        fs.writeFileSync(path.join(repo, '.claude', 'settings.json'), '{ "permissions": ', 'utf8'),
      /is not valid JSON/,
    ],
  ];

  for (const [label, mutate, expected] of cases) {
    test(label, () => {
      const repo = mutated(`case-${label.replace(/\W+/g, '-').slice(0, 50)}`, mutate);
      const errors = errorsFor(repo);

      // `expected: null` means the mutation must NOT be reported — the complement of a rule,
      // which is what keeps it from firing on legitimate content.
      if (expected === null) {
        assert.deepEqual(
          errors,
          [],
          'this mutation must not be reported:\n' +
            errors.map((f) => `  ${f.file}: ${f.message}`).join('\n')
        );
        return;
      }

      assert.ok(
        errors.some((f) => expected.test(f.message)),
        `no error matched ${expected}. Errors were:\n` +
          (errors.map((f) => `  ${f.file}: ${f.message}`).join('\n') || '  (none)')
      );
    });
  }
});

describe('a finding never leaks the value it found', () => {
  test('a secret finding reports the kind and the file, not the secret', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const repo = mutated('secret-not-leaked', (r) => {
      fs.appendFileSync(path.join(r, '.claude', 'rules', 'common', 'quality.md'), `\n${secret}\n`);
    });

    const findings = validateAgentConfig(repo);
    const secretFindings = findings.filter((f) => /appears to contain/.test(f.message));

    assert.ok(secretFindings.length > 0, 'expected a secret finding');
    for (const finding of secretFindings) {
      assert.ok(
        !finding.message.includes(secret),
        'the finding printed the secret it found; a check that leaks into a log is worse than none'
      );
      assert.match(finding.message, /rotate the credential/);
    }
  });
});

describe('the frontmatter parser', () => {
  test('returns null when there is no frontmatter', () => {
    assert.equal(parseFrontmatter('# Heading\n'), null);
  });

  test('reports an unterminated block rather than guessing', () => {
    const parsed = parseFrontmatter('---\nname: x\nnever closed\n');

    assert.match(parsed.error, /never closed/);
  });

  test('reports a line that is not key: value', () => {
    const parsed = parseFrontmatter('---\nname: x\nbroken line\n---\nbody\n');

    assert.match(parsed.error, /is not "key: value"/);
  });

  test('reads simple fields and ignores list continuations', () => {
    const parsed = parseFrontmatter(
      ['---', 'name: x', 'paths:', '  - "src/**"', '  - "tests/**"', '---', 'body', ''].join('\n')
    );

    assert.equal(parsed.fields.name, 'x');
    assert.ok(Object.hasOwn(parsed.fields, 'paths'), 'the key itself must be visible');
    assert.match(parsed.body, /body/);
  });

  test('ignores comments', () => {
    const parsed = parseFrontmatter('---\n# a comment\nname: x\n---\n');

    assert.deepEqual(Object.keys(parsed.fields), ['name']);
  });
});
