let requests = new AbortController();
export function resetApiRequests() {
  requests.abort();
  requests = new AbortController();
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
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
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    if (response.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
      window.dispatchEvent(new Event('waypoint:unauthenticated'));
    }
    throw new HttpError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      response.status >= 500
        ? 'The server could not complete your request. Please try again.'
        : (error?.message ?? 'The request failed. Please try again.'),
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
