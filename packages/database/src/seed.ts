import { createDatabase } from './client.ts';
import { loadDatabaseEnv } from './env.ts';
import { loadSeedEnv } from './seed/env.ts';
import { formatSeedReport } from './seed/print.ts';
import { seedDatabase } from './seed/run.ts';

const databaseEnv = loadDatabaseEnv(process.env);
const seedEnv = loadSeedEnv(process.env);
const connection = createDatabase(databaseEnv.DATABASE_URL, {
  onPoolError: (error) => console.error('Database pool error', error),
});

try {
  const result = await seedDatabase(connection.db, {
    reset: process.argv.includes('--reset'),
    ...(seedEnv.dataDir !== undefined ? { dataDir: seedEnv.dataDir } : {}),
    ...(seedEnv.demoDate !== undefined ? { demoDate: seedEnv.demoDate } : {}),
    password: seedEnv.password,
  });
  console.log(formatSeedReport(result));
} finally {
  await connection.close();
}
