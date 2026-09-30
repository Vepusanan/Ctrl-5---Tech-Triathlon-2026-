import type { Database } from '@waypoint/database';
import { healthResponseSchema } from '@waypoint/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createHealthRepo } from './repo.ts';
import { createHealthService } from './service.ts';

export const healthRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  const service = createHealthService(createHealthRepo(db), app.log);

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
};
