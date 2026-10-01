import rateLimit from '@fastify/rate-limit';
import { apiErrorSchema, currentUserResponseSchema, loginRequestSchema } from '@waypoint/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ApiError } from '../../plugins/errors.ts';
import { everyRole } from '../../plugins/rbac.ts';
import { clearSessionCookieOptions, SESSION_COOKIE, sessionCookieOptions } from './cookies.ts';

const LOGIN_LIMIT = 10;

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.authService;
  const secure = app.secureCookies;

  await app.register(rateLimit, { global: false });

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: LOGIN_LIMIT, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        body: loginRequestSchema,
        response: {
          200: currentUserResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await service.login(request.body);
      reply.setCookie(SESSION_COOKIE, result.sessionId, sessionCookieOptions(secure));
      return { user: result.user };
    },
  );

  app.post(
    '/auth/logout',
    {
      preHandler: app.requireRole(...everyRole()),
      schema: { tags: ['auth'] },
    },
    async (request, reply) => {
      await service.logout(request.user, request.sessionId);
      reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(secure));
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: app.requireRole(...everyRole()),
      schema: {
        tags: ['auth'],
        response: { 200: currentUserResponseSchema, 401: apiErrorSchema, 403: apiErrorSchema },
      },
    },
    async (request) => {
      if (request.user === null) {
        throw new ApiError('UNAUTHENTICATED', 'Sign in required');
      }
      return { user: request.user };
    },
  );
};
