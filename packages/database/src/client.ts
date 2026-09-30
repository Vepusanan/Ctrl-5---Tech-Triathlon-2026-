import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  close: () => Promise<void>;
}

interface DatabaseOptions {
  // Idle pool clients emit errors (for example when Postgres restarts); unhandled, they crash the process.
  onPoolError: (error: Error) => void;
}

export function createDatabase(
  connectionString: string,
  { onPoolError }: DatabaseOptions,
): DatabaseConnection {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  pool.on('error', onPoolError);
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
