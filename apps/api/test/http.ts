import { Writable } from 'node:stream';
import type { InjectOptions } from 'fastify';

interface CookieResponse {
  headers: { 'set-cookie'?: string | string[] | undefined };
}

export const SESSION_SECRET = 'x'.repeat(64);

export function logCapture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, logger: { level: 'info' as const, stream } };
}

export function setCookieHeader(response: CookieResponse): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const session = values.find((value) => value.startsWith('session='));
  if (session === undefined) throw new Error('Expected a session cookie');
  return session;
}

export function cookiePair(response: CookieResponse): string {
  const pair = setCookieHeader(response).split(';')[0];
  if (pair === undefined || pair.length === 0) throw new Error('Expected a session cookie');
  return pair;
}

let address = 10;

export function client(extra: InjectOptions = {}): InjectOptions {
  address += 1;
  return { ...extra, remoteAddress: `10.2.0.${address}` };
}
