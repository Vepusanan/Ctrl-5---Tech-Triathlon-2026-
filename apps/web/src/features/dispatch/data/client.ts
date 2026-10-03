import { HttpError, api as http, message, noContent } from '../../../lib/api';
import { sources } from './sources';

export { HttpError, message, noContent };

/**
 * The Dispatcher pages' only way to data. Each page asks for a path and parses the answer with
 * its contract (../contracts.ts), and never knows which of three places answered:
 *
 * 1. a source (./sources): the real API, mapped into the contract;
 * 2. a fixture (./fixtures): Figma-derived data for what the API does not return yet;
 * 3. the real API as it is, for every other path.
 *
 * `VITE_DISPATCH_FIXTURES=all` skips step 1, which shows every page with the Figma scenario.
 */
export interface SourceRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Path uses `:name` segments and is relative to `/api/v1`. Return `undefined` for no content. */
export type Source = readonly [
  method: Method,
  path: string,
  handler: (request: SourceRequest) => Promise<unknown>,
];

const FIXTURES_ONLY = import.meta.env.VITE_DISPATCH_FIXTURES === 'all';

function match(pattern: string, path: string): Record<string, string> | null {
  const wanted = pattern.split('/');
  const actual = path.split('/');
  if (wanted.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of wanted.entries()) {
    const value = actual[index] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  return params;
}

function parseBody(body: RequestInit['body']): unknown {
  if (typeof body !== 'string' || body.length === 0) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function parsed<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new HttpError(
      502,
      'INVALID_RESPONSE',
      'The server returned an unexpected response. Please refresh.',
    );
  }
}

export async function api<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(path, 'http://waypoint.local');
  const method = (options.method ?? 'GET').toUpperCase();
  if (!FIXTURES_ONLY) {
    for (const [sourceMethod, pattern, handler] of sources) {
      if (sourceMethod !== method) continue;
      const params = match(pattern, url.pathname);
      if (!params) continue;
      const value = await handler({
        params,
        query: url.searchParams,
        body: parseBody(options.body),
        headers: Object.fromEntries(new Headers(options.headers).entries()),
      });
      return parsed(schema, value ?? null);
    }
  }
  // Loaded on demand, so the fixtures stay out of the first bundle.
  const fixtures = await import('./fixtures');
  if (!fixtures.hasFixture(method, url.pathname)) return http(path, schema, options);
  const response = await fixtures.fixtureFetch(path, options);
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as { code?: string; message?: string } | null;
    throw new HttpError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request failed. Please try again.',
    );
  }
  return parsed(schema, body);
}
