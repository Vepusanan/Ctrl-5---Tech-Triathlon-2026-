import type { Database } from '@waypoint/database';
import fp from 'fastify-plugin';

export const dbPlugin = fp(
  async (app, opts: { db: Database }) => {
    app.decorate('db', opts.db);
  },
  { name: 'db' },
);
