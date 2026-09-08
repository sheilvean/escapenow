/**
 * Open a PostgreSQL connection and run SELECT 1.
 *
 * Used by the `database` check stage. Speaks the same connection string the API uses
 * (`ConnectionStrings__EscapeNow`, ADO.NET form) so local compose and CI do not grow a second
 * owner for the coordinates.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/** Published demo credential; matches compose.yaml. Not a secret. */
export const DEVELOPMENT_CONNECTION_STRING =
  'Host=localhost;Port=5432;Database=escapenow;Username=escapenow;Password=escapenow';

export function resolveConnectionString(env = process.env) {
  const fromEnv = env.CONNECTIONSTRINGS__ESCAPENOW;
  return typeof fromEnv === 'string' && fromEnv.trim() !== ''
    ? fromEnv
    : DEVELOPMENT_CONNECTION_STRING;
}

/**
 * Split an ADO.NET-style `Host=...;Username=...` string into `pg` Client options.
 *
 * @param {string} connectionString
 */
export function parseAdoNet(connectionString) {
  const map = {};
  for (const part of connectionString.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    map[trimmed.slice(0, separator).trim().toLowerCase()] = trimmed.slice(separator + 1).trim();
  }

  const port = Number(map.port ?? 5432);
  return {
    host: map.host ?? 'localhost',
    port: Number.isFinite(port) ? port : 5432,
    user: map.username ?? map.user ?? '',
    password: map.password ?? '',
    database: map.database ?? '',
  };
}

/**
 * @param {string} [connectionString]
 * @param {{ Client?: typeof pg.Client }} [deps]
 */
export async function pingPostgres(connectionString = resolveConnectionString(), deps = {}) {
  const Client = deps.Client ?? pg.Client;
  const client = new Client(parseAdoNet(connectionString));
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  pingPostgres()
    .then(() => {
      process.stdout.write('PostgreSQL accepted SELECT 1\n');
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
