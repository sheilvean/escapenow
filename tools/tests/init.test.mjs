/**
 * First-time initialization substitutions.
 *
 * The portability suite covers the full rename. These cases pin the NuGet lock-file behaviour
 * that suite found the hard way: project ids are lowercase, RestoreLockedMode is case-sensitive,
 * and a mixed-case placeholder replace leaves CI restore failing with NU1004.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyInit, planInit } from '../lib/init.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'artifacts', 'init-tests');

const baseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'rename.manifest.json'), 'utf8'));

function makeUninitRepo(name) {
  const repo = path.join(SCRATCH, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'openspec'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src', 'AppTemplate.Application'), { recursive: true });

  const config = structuredClone(baseConfig);
  config.solutionName = 'AcmeOrders';
  config.rootNamespace = 'AcmeOrders';
  config.paths.solutionFile = 'AcmeOrders.slnx';
  config.template.initialized = false;
  config.template.appliedTokens = {};

  fs.writeFileSync(path.join(repo, 'project.config.json'), JSON.stringify(config, null, 2), 'utf8');
  fs.copyFileSync(
    path.join(ROOT, 'tools', 'rename.manifest.json'),
    path.join(repo, 'tools', 'rename.manifest.json')
  );
  fs.writeFileSync(
    path.join(repo, 'openspec', 'project-context.md'),
    '# Context\n\n## What this is\n\nA fixture.\n',
    'utf8'
  );

  return { repo, config };
}

before(() => fs.mkdirSync(SCRATCH, { recursive: true }));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

describe('NuGet lock files', () => {
  test('lowercase project ids are rewritten so locked restore can succeed', () => {
    const { repo, config } = makeUninitRepo('lock-ids');
    const lockFile = path.join(repo, 'src', 'AppTemplate.Application', 'packages.lock.json');
    fs.writeFileSync(
      lockFile,
      JSON.stringify(
        {
          version: 2,
          dependencies: {
            'net10.0': {
              'apptemplate.domain': { type: 'Project' },
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const plan = planInit(repo, config, manifest);
    const lockEdit = plan.contentEdits.find((edit) =>
      edit.file.replaceAll('\\', '/').endsWith('src/AppTemplate.Application/packages.lock.json')
    );

    assert.ok(lockEdit, 'the lock file is in the substitution plan');
    assert.equal(lockEdit.value, 'AcmeOrders');
    assert.ok(lockEdit.occurrences > 0, 'lowercase ids count as substitutions');

    applyInit(repo, config, manifest, plan, { dryRun: false });

    const updated = fs.readFileSync(
      path.join(repo, 'src', 'AcmeOrders.Application', 'packages.lock.json'),
      'utf8'
    );
    assert.match(updated, /"acmeorders.domain"/);
    assert.doesNotMatch(updated, /apptemplate/i);
  });

  test('a mixed-case placeholder in a lock file is not left behind', () => {
    const { repo, config } = makeUninitRepo('lock-mixed');
    const lockFile = path.join(repo, 'src', 'AppTemplate.Application', 'packages.lock.json');
    fs.writeFileSync(
      lockFile,
      '{\n  "comment": "AppTemplate.Application depends on apptemplate.domain"\n}\n',
      'utf8'
    );

    applyInit(repo, config, manifest, planInit(repo, config, manifest), { dryRun: false });

    const updated = fs.readFileSync(
      path.join(repo, 'src', 'AcmeOrders.Application', 'packages.lock.json'),
      'utf8'
    );
    assert.match(updated, /AcmeOrders\.Application/);
    assert.match(updated, /acmeorders\.domain/);
    assert.doesNotMatch(updated, /AppTemplate/);
    assert.doesNotMatch(updated, /apptemplate/);
  });
});
