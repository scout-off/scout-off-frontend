import { refreshSession } from './sessionClient';

/**
 * Same-origin JSON client for sensitive routes that may demand step-up
 * re-authentication (issue #1676).
 *
 * The session lives in httpOnly cookies, so requests carry it automatically
 * (`credentials: 'same-origin'`). On a 401 with code REAUTH_REQUIRED the
 * registered handler prompts the user for a fresh SEP-10 signature, then the
 * request is retried once. Any other 401 triggers one silent refresh via
 * /api/auth/refresh before retrying.
 */

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

  constructor(
    status: number,
    message: string,
    code?: string,
    payload?: unknown,
  ) {
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
 * aborts the retry and surfaces an error to the caller.
 */
export type ReauthHandler = () => Promise<void>;

let reauthHandler: ReauthHandler | null = null;

export function setReauthHandler(handler: ReauthHandler | null): void {
  reauthHandler = handler;
}

const REAUTH_REQUIRED = 'REAUTH_REQUIRED';
const REAUTH_CANCELLED_MESSAGE =
  'Re-authentication was cancelled. Confirm with your wallet to continue.';

async function parseError(
  res: Response,
): Promise<{ code?: string; message: string; payload?: unknown }> {
  let payload: unknown;
  let code: string | undefined;
  let message = res.statusText || `Request failed with status ${res.status}`;
  try {
    payload = await res.json();
    const err = (payload as { error?: { code?: string; message?: string } })
      ?.error;
    if (err) {
      code = err.code;
      if (err.message) message = err.message;
    }
  } catch {
    // Non-JSON error body; keep the status text.
  }
  return { code, message, payload };
}

function send(url: string, options: HttpRequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'same-origin',
  });
}

export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  let res = await send(url, options);

  if (res.status === 401) {
    const firstError = await parseError(res.clone());

    if (firstError.code === REAUTH_REQUIRED && !options.skipReauth) {
      if (!reauthHandler) {
        throw new HttpError(
          401,
          REAUTH_CANCELLED_MESSAGE,
          REAUTH_REQUIRED,
          firstError.payload,
        );
      }
      try {
        await reauthHandler();
      } catch {
        throw new HttpError(
          401,
          REAUTH_CANCELLED_MESSAGE,
          REAUTH_REQUIRED,
          firstError.payload,
        );
      }
      res = await send(url, options);
    } else {
      // Standard access-token expiry: refresh once, then retry.
      const refreshed = await refreshSession();
      if (refreshed.authenticated) {
        res = await send(url, options);
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

export const reauthHttpClient = {
  get: <T = unknown>(url: string, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'GET' }),
  post: <T = unknown>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ) => httpRequest<T>(url, { ...options, method: 'POST', body }),
  put: <T = unknown>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ) => httpRequest<T>(url, { ...options, method: 'PUT', body }),
  patch: <T = unknown>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ) => httpRequest<T>(url, { ...options, method: 'PATCH', body }),
  delete: <T = unknown>(url: string, options?: HttpRequestOptions) =>
    httpRequest<T>(url, { ...options, method: 'DELETE' }),
};
