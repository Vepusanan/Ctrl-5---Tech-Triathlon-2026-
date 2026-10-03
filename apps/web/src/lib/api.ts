import { apiErrorSchema, type Violation } from '@waypoint/shared';

let requests = new AbortController();
export function resetApiRequests() {
  requests.abort();
  requests = new AbortController();
}

export class HttpError extends Error {
  status: number;
  code: string;
  violations: Violation[];
  constructor(status: number, code: string, message: string, violations: Violation[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.violations = violations;
  }
}
export async function api<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: 'include',
      signal: AbortSignal.any([
        requests.signal,
        AbortSignal.timeout(20_000),
        ...(options.signal ? [options.signal] : []),
      ]),
      headers: {
        // A FormData body needs the browser's multipart boundary, so it sets its own type.
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new HttpError(
      0,
      'NETWORK_ERROR',
      options.method && options.method !== 'GET'
        ? 'The request could not be confirmed. Refresh to check whether it was saved before trying again.'
        : 'Could not reach Waypoint. Check your connection and try again.',
    );
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
      window.dispatchEvent(new Event('waypoint:unauthenticated'));
    }
    // SYSTEM_DESIGN §6.3: every API failure is { error: { code, message, violations? } }.
    // Anything else (a proxy error page, an empty body) keeps the HTTP status only.
    const envelope = apiErrorSchema.safeParse(body);
    if (!envelope.success) {
      throw new HttpError(
        response.status,
        'REQUEST_FAILED',
        'The request failed. Please try again.',
      );
    }
    const { error } = envelope.data;
    throw new HttpError(
      response.status,
      error.code,
      response.status >= 500
        ? 'The server could not complete your request. Please try again.'
        : error.message,
      error.violations ?? [],
    );
  }
  try {
    return schema.parse(body);
  } catch {
    throw new HttpError(
      502,
      'INVALID_RESPONSE',
      'The server returned an unexpected response. Please refresh.',
    );
  }
}
export const noContent = { parse: () => undefined };
export const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
