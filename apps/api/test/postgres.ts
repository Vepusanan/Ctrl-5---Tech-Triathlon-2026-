import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, type Database, databaseUrlSchema } from '@waypoint/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const API_TEST_DATABASE = 'waypoint_api_test';

function databaseUrl(): string {
  if (process.env.DATABASE_URL === undefined) {
    const file = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
    for (const line of file.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  const parsed = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
  if (!parsed.success) {
    throw new Error('DATABASE_URL is required for API integration tests');
  }
  return parsed.data;
}

function withDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function recreateDatabase(adminUrl: string, databaseName: string) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `select pg_terminate_backend(pid)
       from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [databaseName],
    );
    await client.query(`drop database if exists ${databaseName}`);
    await client.query(`create database ${databaseName}`);
  } finally {
    await client.end();
  }
}

export async function createMigratedDatabase(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const adminUrl = databaseUrl();
  await recreateDatabase(adminUrl, API_TEST_DATABASE);
  const connection = createDatabase(withDatabase(adminUrl, API_TEST_DATABASE), {
    onPoolError: () => undefined,
  });
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(
      new URL('../../../packages/database/migrations', import.meta.url),
    ),
  });
  return connection;
}
