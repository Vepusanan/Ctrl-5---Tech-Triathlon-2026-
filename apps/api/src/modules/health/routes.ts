import { healthResponseSchema, readinessResponseSchema } from '@waypoint/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { expectedMigrationCount } from './migrations.ts';
import { createHealthRepo } from './repo.ts';
import { createHealthService } from './service.ts';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createHealthService(createHealthRepo(app.db), app.log, expectedMigrationCount());

  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const health = await service.check();
      return reply.code(health.status === 'ok' ? 200 : 503).send(health);
    },
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
      },
    },
    async (_request, reply) => {
      const readiness = await service.ready();
      return reply.code(readiness.status === 'ok' ? 200 : 503).send(readiness);
    },
  );
};
