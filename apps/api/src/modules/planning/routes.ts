import {
  allocationResponseSchema,
  apiErrorSchema,
  autoAllocateResponseSchema,
  createDeferralRequestSchema,
  deferralSchema,
  ifMatchHeadersSchema,
  moveAllocationRequestSchema,
  planningQueueResponseSchema,
  planningRunParamsSchema,
  publishPlanResponseSchema,
  simulatePlanRequestSchema,
  simulatePlanResponseSchema,
  validatePlanRequestSchema,
  validatePlanResponseSchema,
} from '@waypoint/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createPlanningService } from './service.ts';

export const planningRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createPlanningService(app.db, app.audit, app.domainEvents, app.clock);

  app.get(
    '/planning/runs/:date/queue',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        params: planningRunParamsSchema,
        response: {
          200: planningQueueResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => service.queue(request.user, request.params.date),
  );

  app.post(
    '/planning/runs/:date/auto-allocate',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        params: planningRunParamsSchema,
        headers: ifMatchHeadersSchema,
        response: {
          200: autoAllocateResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) =>
      service.autoAllocate(request.user, request.params.date, request.headers['if-match']),
  );

  app.post(
    '/planning/validate',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        body: validatePlanRequestSchema,
        response: {
          200: validatePlanResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => service.validate(request.user, request.body),
  );

  app.put(
    '/planning/runs/:date/allocations',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        params: planningRunParamsSchema,
        headers: ifMatchHeadersSchema,
        body: moveAllocationRequestSchema,
        response: {
          200: allocationResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) =>
      service.move(request.user, request.params.date, request.headers['if-match'], request.body),
  );

  app.post(
    '/deferrals',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        headers: ifMatchHeadersSchema,
        body: createDeferralRequestSchema,
        response: {
          200: deferralSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => service.defer(request.user, request.headers['if-match'], request.body),
  );

  app.post(
    '/planning/runs/:date/simulate',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        params: planningRunParamsSchema,
        body: simulatePlanRequestSchema,
        response: {
          200: simulatePlanResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => service.simulate(request.user, request.params.date, request.body),
  );

  app.post(
    '/planning/runs/:date/publish',
    {
      preHandler: app.requireRole('dispatcher'),
      schema: {
        tags: ['planning'],
        params: planningRunParamsSchema,
        headers: ifMatchHeadersSchema,
        response: {
          200: publishPlanResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) =>
      service.publish(request.user, request.params.date, request.headers['if-match']),
  );
};
