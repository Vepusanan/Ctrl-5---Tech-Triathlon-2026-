import { sql } from 'drizzle-orm';
import { createDatabase } from './client.ts';
import { loadDatabaseEnv } from './env.ts';

const env = loadDatabaseEnv(process.env);
const connection = createDatabase(env.DATABASE_URL, {
  onPoolError: (error) => console.error('Database pool error', error),
});

try {
  await connection.db.execute(sql`select 1`);
  console.log('Database reachable. No seed steps are defined yet.');
} finally {
  await connection.close();
}
