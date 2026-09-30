import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.ts';
import { loadDatabaseEnv } from './env.ts';

const env = loadDatabaseEnv(process.env);
const connection = createDatabase(env.DATABASE_URL, {
  onPoolError: (error) => console.error('Database pool error', error),
});

try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  console.log('Migrations applied.');
} finally {
  await connection.close();
}
