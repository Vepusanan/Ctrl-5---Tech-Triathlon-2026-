import { createDatabase } from '@waypoint/database';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createHealthService } from '../src/modules/health/service.ts';

const silentLog = { warn: () => {} };

describe('health service', () => {
  it('reports ok when the database answers', async () => {
    const service = createHealthService(
      { pingDatabase: async () => {}, appliedMigrations: async () => 1 },
      silentLog,
      1,
    );
    await expect(service.check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('reports unavailable when the database ping fails', async () => {
    const service = createHealthService(
      {
        pingDatabase: async () => {
          throw new Error('connection refused');
        },
        appliedMigrations: async () => 1,
      },
      silentLog,
      1,
    );
    await expect(service.check()).resolves.toEqual({ status: 'unavailable', database: 'down' });
  });

  it('is ready only when the database is up and migrations are applied', async () => {
    const ready = createHealthService(
      { pingDatabase: async () => {}, appliedMigrations: async () => 3 },
      silentLog,
      3,
    );
    await expect(ready.ready()).resolves.toEqual({
      status: 'ok',
      database: 'up',
      migrations: 'applied',
    });

    const pending = createHealthService(
      { pingDatabase: async () => {}, appliedMigrations: async () => 1 },
      silentLog,
      3,
    );
    await expect(pending.ready()).resolves.toEqual({
      status: 'unavailable',
      database: 'up',
      migrations: 'pending',
    });

    const down = createHealthService(
      {
        pingDatabase: async () => {
          throw new Error('connection refused');
        },
        appliedMigrations: async () => 3,
      },
      silentLog,
      3,
    );
    await expect(down.ready()).resolves.toEqual({
      status: 'unavailable',
      database: 'down',
      migrations: 'pending',
    });
  });
});

describe('GET /api/health', () => {
  const connection = createDatabase('postgres://waypoint:waypoint@127.0.0.1:1/waypoint', {
    onPoolError: () => {},
  });

  afterAll(async () => {
    await connection.close();
  });

  it('returns 503 with a schema-valid body when Postgres is unreachable', async () => {
    const app = await buildApp({
      db: connection.db,
      logger: false,
      sessionSecret: 'x'.repeat(64),
      secureCookies: false,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable', database: 'down' });

      const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({
        status: 'unavailable',
        database: 'down',
        migrations: 'pending',
      });
    } finally {
      await app.close();
    }
  });
});
