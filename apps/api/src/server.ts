import { createDatabase } from '@waypoint/database';
import { buildApp } from './app.ts';
import { loadEnv } from './config/env.ts';

const env = loadEnv(process.env);

const connection = createDatabase(env.DATABASE_URL, {
  onPoolError: (error) => app.log.error({ err: error }, 'db.pool_error'),
});
const app = await buildApp({ db: connection.db, logger: { level: env.LOG_LEVEL } });
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
