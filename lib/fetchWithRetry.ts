/**
 * fetchWithRetry – a light wrapper around `fetch` that retries transient
 * failures with exponential backoff and enforces a per-request timeout via
 * AbortSignal.timeout (issue #1508).
 *
 * **Retryable**:   network errors (TypeError thrown by fetch), 5xx responses
 * **Non-retryable**: 4xx responses (client errors) are never retried
 *
 * The backoff schedule is:
 *   initialDelay * (2^attempt), capped at `maxDelay` ms, plus jitter.
 *
 * On the last retry attempt the response is always returned (even if 5xx) so
 * callers can inspect it and apply their own error handling. Only network
 * errors on the last attempt are thrown.
 *
 * Timeout constants follow the same conventions as lib/httpClient.ts:
 *   - SAME_ORIGIN_READ_TIMEOUT_MS  (5 s)  — GET / HEAD / safe reads
 *   - SAME_ORIGIN_WRITE_TIMEOUT_MS (10 s) — POST / PUT / PATCH / DELETE
 *
 * These are exported so call sites can import them directly and callers can
 * still override with a custom `timeoutMs` when needed.
 */

/** Safe-method (GET/HEAD) timeout for same-origin API calls. */
export const SAME_ORIGIN_READ_TIMEOUT_MS = 5_000;
/** Mutating-method timeout for same-origin API calls. */
export const SAME_ORIGIN_WRITE_TIMEOUT_MS = 10_000;

export interface RetryConfig {
  /** Maximum number of retry attempts (excluding the initial request). */
  maxRetries?: number;
  /** Initial delay before the first retry (ms). */
  initialDelayMs?: number;
  /** Absolute ceiling for any single backoff delay (ms). */
  maxDelayMs?: number;
  /** Optional callback fired on each retry attempt (useful for logging). */
  onRetry?: (attempt: number, error: unknown) => void;
  /**
   * Per-attempt timeout in ms.  A fresh `AbortSignal.timeout(timeoutMs)` is
   * created for each attempt so the clock resets on every retry.  When the
   * caller also provides an `AbortSignal` in `init.signal`, both signals are
   * combined via `AbortSignal.any` so either a timeout *or* explicit
   * cancellation will abort the in-flight request.
   *
   * Defaults to `SAME_ORIGIN_READ_TIMEOUT_MS` (5 s).
   */
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  onRetry: () => {},
  timeoutMs: SAME_ORIGIN_READ_TIMEOUT_MS,
};

function isTransientError(error: unknown): boolean {
  // Network errors (fetch throws a TypeError on DNS / TCP failures)
  if (error instanceof TypeError) return true;
  // AbortError thrown when AbortSignal.timeout fires — treat as transient
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return true;
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the `AbortSignal` for a single fetch attempt.
 *
 * - If the runtime supports `AbortSignal.timeout` (Node 18+, all modern
 *   browsers), we create a per-attempt timeout signal and, when the caller
 *   also supplied their own signal in `init.signal`, combine both with
 *   `AbortSignal.any` so *either* a timeout *or* explicit cancellation aborts
 *   the request.
 * - Falls back gracefully when `AbortSignal.timeout` is unavailable so the
 *   function still works in older environments (just without the timeout).
 */
function buildSignal(
  timeoutMs: number,
  callerSignal: AbortSignal | null | undefined,
): AbortSignal | undefined {
  if (typeof AbortSignal?.timeout !== 'function') {
    // Older runtime — return caller's signal as-is (or nothing).
    return callerSignal ?? undefined;
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (callerSignal) {
    // AbortSignal.any is available in Node 20+ and modern browsers.
    if (typeof AbortSignal?.any === 'function') {
      return AbortSignal.any([timeoutSignal, callerSignal]);
    }
    // Fallback: prefer the caller signal; timeout fires separately.
    return callerSignal;
  }
  return timeoutSignal;
}

/**
 * Fetches `url` with the given `init` options, retrying on transient failures.
 *
 * Returns the raw `Response` object so callers can inspect headers (e.g.
 * Retry-After) or stream the body. On the last retry attempt the response is
 * returned unconditionally — callers should check `response.ok` and handle
 * errors themselves. Network errors on the last attempt are thrown.
 *
 * A fresh `AbortSignal.timeout(config.timeoutMs)` is generated for every
 * attempt so the clock resets between retries. Pass `timeoutMs: 0` to opt
 * out of per-attempt timeouts entirely (not recommended for production use).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  config: RetryConfig = {},
): Promise<Response> {
  const { maxRetries, initialDelayMs, maxDelayMs, onRetry, timeoutMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Build a fresh per-attempt signal so the timeout clock resets on retry.
    const signal =
      timeoutMs > 0
        ? buildSignal(timeoutMs, init?.signal as AbortSignal | undefined)
        : (init?.signal ?? undefined);

    try {
      const response = await fetch(url, { ...init, signal });

      // Non-retryable client error — return immediately for caller handling
      if (!response.ok && !isRetryableStatus(response.status)) {
        return response;
      }

      // Success, or last attempt: return the response regardless of status
      if (response.ok || attempt === maxRetries) {
        return response;
      }

      // 5xx on a non-last attempt — record and retry
      lastError = response;
    } catch (err: unknown) {
      lastError = err;
      // Only retry TypeError (network errors), not programmer mistakes
      if (!isTransientError(err)) {
        throw err;
      }
      // Network error on the last attempt — don't retry, re-throw
      if (attempt >= maxRetries) {
        throw err;
      }
    }

    // Exponential backoff before next retry
    const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
    const jitter = Math.random() * 0.3 * delay; // up to 30% jitter
    onRetry(attempt + 1, lastError);
    await sleep(delay + jitter);
  }

  // This line is never reached because the loop always returns or throws,
  // but TypeScript doesn't know that.
  throw new Error('Unexpected: fetchWithRetry loop exited without returning');
}

/**
 * Convenience wrapper: fetch with retry and parse the response as JSON.
 */
export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  init?: RequestInit,
  config?: RetryConfig,
): Promise<T> {
  const response = await fetchWithRetry(url, init, config);
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

/**
 * Single-shot fetch with a timeout — no retries.
 *
 * Intended for **mutating** same-origin requests (POST / PUT / PATCH / DELETE)
 * that deliberately avoid `fetchWithRetry` because they are not idempotent.
 * Adds a per-request `AbortSignal.timeout` so flaky mobile connections
 * cannot hang the UI spinner indefinitely (issue #1508).
 *
 * When the caller already passes an `AbortSignal` in `init.signal`, it is
 * combined with the timeout signal via `AbortSignal.any` so *either* an
 * explicit cancellation *or* a timeout will abort the request.
 *
 * @param url        Request URL
 * @param init       Standard `fetch` init options (method, headers, body, …)
 * @param timeoutMs  Per-request deadline in ms (default: SAME_ORIGIN_WRITE_TIMEOUT_MS)
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = SAME_ORIGIN_WRITE_TIMEOUT_MS,
): Promise<Response> {
  const signal =
    timeoutMs > 0
      ? buildSignal(timeoutMs, init?.signal as AbortSignal | undefined)
      : (init?.signal ?? undefined);
  return fetch(url, { ...init, signal });
}
