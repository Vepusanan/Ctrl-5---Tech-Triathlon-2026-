import type { HealthResponse } from '@waypoint/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { HealthRepo } from './repo.ts';

export function createHealthService(repo: HealthRepo, log: Pick<FastifyBaseLogger, 'warn'>) {
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
  };
}
