/**
 * Consistency between the two start paths.
 *
 * The GitHub-template path reads `tools/rename.manifest.json`; the `dotnet new` path reads
 * `.template.config/template.json`. They must agree, or the same template produces two different
 * applications depending on how it was started — and the exclusion lists matter most: a file the
 * manifest protects but `template.json` does not would be silently rewritten on one path only.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools', 'rename.manifest.json'), 'utf8')
);

/**
 * `.template.config/template.json` is legitimately absent in two cases, and neither is a failure:
 *
 *   - a repository generated through `dotnet new`, because the template excludes its own
 *     `.template.config/` from the output;
 *   - a repository that deleted it, which docs/customizing-the-template.md offers as an option
 *     for a project that will never be published as a template.
 *
 * Reading it at module load would crash the whole file in both cases — including inside the
 * generated application's own check, which is how this was found. The comparison tests skip
 * instead, with a reason.
 */
const templatePath = path.join(ROOT, '.template.config', 'template.json');
const hasTemplateJson = fs.existsSync(templatePath);
const template = hasTemplateJson ? JSON.parse(fs.readFileSync(templatePath, 'utf8')) : null;

const noTemplateJsonReason =
  '.template.config/template.json is not present, so there is no `dotnet new` path to compare ' +
  'against. That is the expected state in a generated application, and a supported one in a ' +
  'project that will never be published as a template.';

/** The exclude list `dotnet new` applies, flattened from its sources/modifiers structure. */
function templateExcludes() {
  return (template?.sources ?? []).flatMap((source) =>
    (source.modifiers ?? []).flatMap((modifier) => modifier.exclude ?? [])
  );
}

describe('the two start paths declare the same token', () => {
  test('template.json sourceName equals the manifest placeholder', (t) => {
    if (!hasTemplateJson) return t.skip(noTemplateJsonReason);

    assert.equal(
      template.sourceName,
      manifest.placeholder.solutionName,
      'sourceName is what the template engine substitutes; if it differs from the manifest ' +
        'placeholder, `dotnet new` renames something else than `repo.mjs init` does.'
    );
  });

  test('every manifest token maps to a field template.json actually declares', (t) => {
    if (!hasTemplateJson) return t.skip(noTemplateJsonReason);

    assert.ok(manifest.tokens.length > 0, 'the manifest declares no tokens');

    for (const token of manifest.tokens) {
      const symbol = token.templateSymbol;
      const declared =
        Object.hasOwn(template, symbol) || Object.hasOwn(template.symbols ?? {}, symbol);

      assert.ok(
        declared,
        `manifest token "${token.name}" maps to template.json symbol "${symbol}", which ` +
          'template.json does not declare. The dotnet new path would not apply it.'
      );
    }
  });

  test('every token resolves to a real path in project.config.json', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));

    for (const token of manifest.tokens) {
      const value = token.configPath
        .split('.')
        .reduce((acc, segment) => (acc === undefined ? undefined : acc[segment]), config);

      assert.equal(
        typeof value,
        'string',
        `manifest token "${token.name}" points at project.config.json path ` +
          `"${token.configPath}", which is not a string.`
      );
      assert.ok(value.length > 0);
    }
  });
});

describe('the two start paths protect the same files', () => {
  test('every manifest exclusion is also excluded by template.json', (t) => {
    if (!hasTemplateJson) return t.skip(noTemplateJsonReason);

    const excludes = templateExcludes();
    assert.ok(excludes.length > 0, 'template.json declares no exclusions at all');

    // Exclusions that exist only to keep repo.mjs from rewriting files it has no business in.
    // The dotnet new path must protect the same ones, or it rewrites them instead.
    const mustMatch = manifest.excludeGlobs.filter(
      (glob) =>
        glob.startsWith('node_modules') ||
        glob.startsWith('.git/') ||
        glob.includes('/bin/') ||
        glob.includes('/obj/') ||
        glob.startsWith('openspec/changes')
    );

    assert.ok(mustMatch.length > 0, 'expected the manifest to protect build output and history');

    for (const glob of mustMatch) {
      assert.ok(
        excludes.some((e) => e === glob || e.replace(/\/\*\*$/, '') === glob.replace(/\/\*\*$/, '')),
        `the manifest excludes "${glob}" but template.json does not. The dotnet new path would ` +
          'rewrite it.'
      );
    }
  });

  test('template.json does not exclude the files the manifest needs to rewrite', (t) => {
    if (!hasTemplateJson) return t.skip(noTemplateJsonReason);

    const excludes = templateExcludes().map((e) => e.replace(/\/\*\*$/, ''));

    for (const glob of manifest.contentGlobs) {
      const prefix = glob.split('/')[0];
      assert.ok(
        !excludes.includes(prefix) && !excludes.includes(glob),
        `template.json excludes "${glob}", which the manifest lists as a file whose contents must ` +
          'be substituted. The dotnet new path would leave the placeholder in place.'
      );
    }
  });
});

/**
 * The manifest's globs are written against the placeholder, so they describe the template
 * *before* initialization. In a generated application they legitimately match nothing — the files
 * have been renamed. These tests therefore skip once `template.initialized` is true, rather than
 * failing every downstream repository for doing exactly what it was supposed to do.
 */
describe('the manifest describes files that exist', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
  const generated = config.template.initialized === true;
  const skipReason =
    'this repository is an initialized application, so the placeholder globs no longer match. ' +
    'The template repository is where these are asserted.';

  test('every content glob matches at least one file', (t) => {
    if (generated) return t.skip(skipReason);

    for (const glob of manifest.contentGlobs) {
      const matches = fs.globSync(glob, { cwd: ROOT });
      assert.ok(
        matches.length > 0,
        `manifest contentGlob "${glob}" matches nothing. A stale glob silently stops renaming ` +
          'part of the repository.'
      );
    }
  });

  test('every rename glob matches at least one path', (t) => {
    if (generated) return t.skip(skipReason);

    for (const glob of manifest.renameGlobs) {
      const matches = fs.globSync(glob, { cwd: ROOT });
      assert.ok(matches.length > 0, `manifest renameGlob "${glob}" matches nothing.`);
    }
  });

  test('every generated region names a file with both its markers', () => {
    assert.ok(manifest.generatedRegions.length > 0);

    for (const region of manifest.generatedRegions) {
      const file = path.join(ROOT, region.file);
      assert.ok(fs.existsSync(file), `generated region declared for missing file ${region.file}`);

      const text = fs.readFileSync(file, 'utf8');
      assert.ok(text.includes(region.begin), `${region.file} lacks its begin marker`);
      assert.ok(text.includes(region.end), `${region.file} lacks its end marker`);
    }
  });

  test('the placeholder still appears in the repository', (t) => {
    // In the template repository the placeholder must be present: without it, renaming would do
    // nothing and the template would silently stop being one.
    if (generated) return t.skip(skipReason);

    const found = manifest.contentGlobs.some((glob) =>
      fs
        .globSync(glob, { cwd: ROOT })
        .some((match) =>
          fs.readFileSync(path.join(ROOT, match), 'utf8').includes(manifest.placeholder.solutionName)
        )
    );

    assert.ok(
      found,
      `the placeholder "${manifest.placeholder.solutionName}" appears nowhere in the content ` +
        'globs, yet the repository is not marked initialized. Renaming would do nothing.'
    );
  });
});
