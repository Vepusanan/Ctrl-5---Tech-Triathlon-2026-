/**
 * Fixture transport for Dispatcher requests the API cannot answer yet. See docs/IMPLEMENTATION.md.
 * Handlers return plain JSON; `api()` parses it with the same schema it would use for the server.
 */
interface MockRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

class MockReply {
  status: number;
  body: unknown;
  constructor(status: number, body?: unknown) {
    this.status = status;
    this.body = body;
  }
}

/** Error body in the API's `{ code, message }` shape. */
export const fail = (status: number, code: string, message: string) =>
  new MockReply(status, { code, message });

type MockMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Return a value for 200, `undefined` for 204, or `fail(...)` for an error status. */
export type MockHandler = (request: MockRequest) => unknown;
/** Path uses `:name` segments and is relative to `/api/v1`, for example `/orders/:id`. */
export type MockRoute = readonly [method: MockMethod, path: string, handler: MockHandler];

const LATENCY_MS = 250;

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

/** True when a fixture route answers this method and path (query string excluded). */
export const hasRoute = (routes: readonly MockRoute[], method: string, pathname: string) =>
  routes.some(
    ([routeMethod, pattern]) => routeMethod === method && match(pattern, pathname) !== null,
  );

export function createMockFetch(routes: readonly MockRoute[]) {
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(path, 'http://mock.local');
    const method = (init.method ?? 'GET').toUpperCase();
    let body: unknown = null;
    if (typeof init.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    let result: unknown = fail(
      501,
      'MOCK_MISSING',
      `No fixture for ${method} ${url.pathname} yet.`,
    );
    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue;
      const params = match(pattern, url.pathname);
      if (!params) continue;
      result = handler({ params, query: url.searchParams, body });
      break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS));
    if (result instanceof MockReply) {
      return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
        status: result.status,
      });
    }
    if (result === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(result), { status: 200 });
  };
}
