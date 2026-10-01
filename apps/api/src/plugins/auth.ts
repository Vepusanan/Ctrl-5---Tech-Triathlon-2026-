import cookie from '@fastify/cookie';
import { uuidSchema } from '@waypoint/shared';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../modules/auth/cookies.ts';
import { createAuthService } from '../modules/auth/service.ts';

function isLogout(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0];
  return request.method === 'POST' && path === '/api/v1/auth/logout';
}

export const authPlugin = fp(
  async (app, opts: { sessionSecret: string; secureCookies: boolean }) => {
    app.decorate('secureCookies', opts.secureCookies);
    const service = createAuthService(app.db, app.audit, app.log);
    app.decorate('authService', service);
    app.decorateRequest('user', null);
    app.decorateRequest('sessionId', null);

    await app.register(cookie, { secret: opts.sessionSecret, hook: 'onRequest' });

    app.addHook('onRequest', async (request, reply) => {
      request.user = null;
      request.sessionId = null;
      const raw = request.cookies[SESSION_COOKIE];
      if (raw === undefined || raw.length === 0) return;

      const unsigned = request.unsignCookie(raw);
      const sessionId = unsigned.valid ? uuidSchema.safeParse(unsigned.value) : null;
      if (sessionId === null || !sessionId.success) {
        reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(opts.secureCookies));
        return;
      }

      const loaded = await service.load(sessionId.data);
      if (loaded === null) {
        reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(opts.secureCookies));
        return;
      }

      request.user = loaded.user;
      request.sessionId = loaded.sessionId;
      // Logout deletes the row; refreshing it first would race the clear.
      if (isLogout(request)) return;

      try {
        await service.touch(loaded.sessionId);
      } catch (error) {
        request.log.warn({ err: error }, 'auth.session_refresh_failed');
        return;
      }
      reply.setCookie(SESSION_COOKIE, loaded.sessionId, sessionCookieOptions(opts.secureCookies));
    });
  },
  { name: 'auth', dependencies: ['db', 'audit'] },
);
