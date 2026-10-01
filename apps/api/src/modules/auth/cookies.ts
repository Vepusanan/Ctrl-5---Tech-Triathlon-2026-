import type { CookieSerializeOptions } from '@fastify/cookie';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

function baseOptions(secure: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  };
}

export function sessionCookieOptions(secure: boolean): CookieSerializeOptions {
  return { ...baseOptions(secure), maxAge: SESSION_TTL_SECONDS, signed: true };
}

export function clearSessionCookieOptions(secure: boolean): CookieSerializeOptions {
  return baseOptions(secure);
}
