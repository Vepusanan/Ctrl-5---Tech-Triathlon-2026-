import type { HealthResponse, ReadinessResponse } from '@waypoint/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { HealthRepo } from './repo.ts';

export function createHealthService(
  repo: HealthRepo,
  log: Pick<FastifyBaseLogger, 'warn'>,
  expectedMigrations: number,
) {
  return {
    async check(): Promise<HealthResponse> {
      try {
        await repo.pingDatabase();
        return { status: 'ok', database: 'up' };
      } catch (error) {
        log.warn({ err: error }, 'health.database_unreachable');
        return { status: 'unavailable', database: 'down' };
      }
    },

    async ready(): Promise<ReadinessResponse> {
      try {
        await repo.pingDatabase();
      } catch (error) {
        log.warn({ err: error }, 'health.database_unreachable');
        return { status: 'unavailable', database: 'down', migrations: 'pending' };
      }

      try {
        const applied = await repo.appliedMigrations();
        if (applied < expectedMigrations) {
          return { status: 'unavailable', database: 'up', migrations: 'pending' };
        }
        return { status: 'ok', database: 'up', migrations: 'applied' };
      } catch (error) {
        log.warn({ err: error }, 'health.migrations_pending');
        return { status: 'unavailable', database: 'up', migrations: 'pending' };
      }
    },
  };
}
