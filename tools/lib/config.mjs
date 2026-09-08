/**
 * Repository root discovery and validation of project.config.json.
 *
 * The schema file is the single source of truth for what a valid configuration is;
 * this module only loads and reports. A parse failure or a schema violation is an
 * error — never a fall back to defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const CONFIG_FILE = 'project.config.json';
export const SCHEMA_FILE = 'project.config.schema.json';

export class ConfigError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ConfigError';
    this.details = details;
  }
}

/**
 * Walk up from `startDir` until a directory contains project.config.json.
 * This is what makes invocation from a subdirectory work.
 */
export function findRepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new ConfigError(
        `Could not find ${CONFIG_FILE} in ${path.resolve(startDir)} or any parent directory. ` +
          'Run this command inside a repository generated from the template.'
      );
    }
    dir = parent;
  }
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (cause) {
    throw new ConfigError(`Cannot read ${file}: ${cause.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    // A malformed file is a failure, not an empty configuration.
    throw new ConfigError(`${file} is not valid JSON: ${cause.message}`);
  }
}

function buildValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Load and validate the configuration.
 *
 * @returns {{root: string, configPath: string, config: object}}
 */
export function loadConfig(startDir = process.cwd()) {
  const root = findRepoRoot(startDir);
  const configPath = path.join(root, CONFIG_FILE);
  const schemaPath = path.join(root, SCHEMA_FILE);

  const config = readJson(configPath);
  const schema = readJson(schemaPath);

  const validate = buildValidator(schema);
  if (!validate(config)) {
    const details = (validate.errors ?? []).map((e) => {
      const pointer = e.instancePath === '' ? '/' : e.instancePath;
      const extra = e.params?.additionalProperty
        ? ` (unknown property "${e.params.additionalProperty}")`
        : e.params?.allowedValues
          ? ` (allowed: ${e.params.allowedValues.join(', ')})`
          : '';
      return `${pointer}: ${e.message}${extra}`;
    });
    throw new ConfigError(`${CONFIG_FILE} does not satisfy ${SCHEMA_FILE}`, details);
  }

  return { root, configPath, config };
}

/**
 * Values that belong to another file. project.config.json must not restate them,
 * so a check can fail on duplication instead of letting two truths drift apart.
 * See docs/sources-of-truth.md.
 */
export const FOREIGN_KEYS = [
  { key: 'sdk', owner: 'global.json' },
  { key: 'sdkVersion', owner: 'global.json' },
  { key: 'dotnetVersion', owner: 'global.json' },
  { key: 'targetFramework', owner: 'Directory.Build.props' },
  { key: 'packages', owner: 'Directory.Packages.props' },
  { key: 'packageVersions', owner: 'Directory.Packages.props' },
  { key: 'dependencies', owner: 'package.json' },
  { key: 'devDependencies', owner: 'package.json' },
  { key: 'openspecVersion', owner: 'package.json and package-lock.json' },
  { key: 'requirements', owner: 'openspec/specs/' },
  { key: 'decisions', owner: 'docs/adr/' },
];

/** Detect a value the configuration must not own. Runs on the raw object, at any depth. */
export function findForeignKeys(config) {
  const found = [];
  const walk = (node, pointer) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${pointer}/${i}`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const owned = FOREIGN_KEYS.find((f) => f.key === k);
      if (owned) found.push({ pointer: `${pointer}/${k}`, key: k, owner: owned.owner });
      walk(v, `${pointer}/${k}`);
    }
  };
  walk(config, '');
  return found;
}


