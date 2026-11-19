import { getAccessToken, refreshAccessToken } from './session';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip the automatic step-up re-auth interceptor for this call. */
  skipReauth?: boolean;
}

export class HttpError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(status: number, message: string, code?: string, payload?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/**
 * Callback invoked when a sensitive request is rejected with REAUTH_REQUIRED.
 * It should perform a fresh SEP-10 step-up signature and resolve once the
 * server-side session's auth_time has been refreshed. Rejecting (or throwing)
 * aborts the retry and surfaces a localized error to the caller.
 */
export type ReauthHandler = () => Promise<void>;

let reauthHandler: ReauthHandler | null = null;

export function setReauthHandler(handler: ReauthHandler | null): void {
  reauthHandler = handler;
}

const REAUTH_REQUIRED = 'REAUTH_REQUIRED';
const REAUTH_CANCELLED_MESSAGE =
  'Re-authentication was cancelled. Confirm with your wallet to continue.';

async function parseError(res: Response): Promise<{ code?: string; message: string; payload?: unknown }> {
  let payload: unknown;
  let code: string | undefined;
  let message = res.statusText || `Request failed with status ${res.status}`;
  try {
    payload = await res.json();
    const err = (payload as { error?: { code?: string; message?: string } })?.error;
    if (err) {
      code = err.code;
      if (err.message) message = err.message;
    }
  } catch {
    // Non-JSON error body; keep the status text.
  }
  return { code, message, payload };
}

async function send(
  url: string,
  options: HttpRequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
}

/**
 * Shared HTTP client. On a 401 with code REAUTH_REQUIRED it prompts the user to
 * confirm with their wallet (fresh SEP-10 signature), then retries the original
 * request exactly once. Cancelling the prompt surfaces a localized error.
 */
export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  let token = getAccessToken();
  let res = await send(url, options, token);

  if (res.status === 401) {
    const firstError = await parseError(res.clone());

    if (firstError.code === REAUTH_REQUIRED && !options.skipReauth) {
      if (!reauthHandler) {
        throw new HttpError(401, REAUTH_CANCELLED_MESSAGE, REAUTH_REQUIRED, firstError.payload);
      }
      try {
        await reauthHandler();
      } catch {
        throw new HttpError(401, REAUTH_CANCELLED_MESSAGE, REAUTH_REQUIRED, firstError.payload);
      }
      // Retry the original request once with the refreshed session.
      token = getAccessToken();
      res = await send(url, options, token);
    } else {
      // Standard access-token expiry: refresh once, then retry.
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        token = getAccessToken();
        res = await send(url, options, token);
      }
    }
  }

  if (!res.ok) {
    const { code, message, payload } = await parseError(res);
    throw new HttpError(res.status, message, code, payload);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const httpClient = {
  get: <T = unknown>(url: string, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'POST', body }),
  put: <T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'PUT', body }),
  patch: <T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'PATCH', body }),
  delete: <T = unknown>(url: string, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'DELETE' }),
};
