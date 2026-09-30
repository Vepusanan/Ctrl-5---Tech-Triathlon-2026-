import { createDatabase } from '@waypoint/database';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createHealthService } from '../src/modules/health/service.ts';

const silentLog = { warn: () => {} };

describe('health service', () => {
  it('reports ok when the database answers', async () => {
    const service = createHealthService({ pingDatabase: async () => {} }, silentLog);
    await expect(service.check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('reports unavailable when the database ping fails', async () => {
    const service = createHealthService(
      {
        pingDatabase: async () => {
          throw new Error('connection refused');
        },
      },
      silentLog,
    );
    await expect(service.check()).resolves.toEqual({ status: 'unavailable', database: 'down' });
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
    const app = await buildApp({ db: connection.db, logger: false });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable', database: 'down' });
    } finally {
      await app.close();
    }
  });
});
