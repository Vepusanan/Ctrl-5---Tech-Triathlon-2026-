import { createDatabase, loadSeedEnv } from '@waypoint/database';
import { buildApp } from './app.ts';
import { loadEnv, secureSessionCookies } from './config/env.ts';

const env = loadEnv(process.env);
const seedEnv = env.DEMO_MODE ? loadSeedEnv(process.env) : undefined;

const connection = createDatabase(env.DATABASE_URL, {
  onPoolError: (error) => app.log.error({ err: error }, 'db.pool_error'),
});
const app = await buildApp({
  db: connection.db,
  logger: { level: env.LOG_LEVEL },
  sessionSecret: env.SESSION_SECRET,
  secureCookies: secureSessionCookies(env, process.env.NODE_ENV === 'production'),
  demoMode: env.DEMO_MODE,
  ...(seedEnv === undefined
    ? {}
    : {
        seed: {
          password: seedEnv.password,
          ...(seedEnv.demoDate !== undefined ? { demoDate: seedEnv.demoDate } : {}),
          ...(seedEnv.dataDir !== undefined ? { dataDir: seedEnv.dataDir } : {}),
        },
      }),
});
app.addHook('onClose', () => connection.close());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'shutdown_failed');
        process.exit(1);
      },
    );
  });
}

await app.listen({ host: env.HOST, port: env.PORT });
