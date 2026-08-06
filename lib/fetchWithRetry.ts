/**
 * fetchWithRetry – a light wrapper around `fetch` that retries transient
 * failures with exponential backoff.
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
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (excluding the initial request). */
  maxRetries?: number;
  /** Initial delay before the first retry (ms). */
  initialDelayMs?: number;
  /** Absolute ceiling for any single backoff delay (ms). */
  maxDelayMs?: number;
  /** Optional callback fired on each retry attempt (useful for logging). */
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  onRetry: () => {},
};

function isTransientError(error: unknown): boolean {
  // Network errors (fetch throws a TypeError on DNS / TCP failures)
  if (error instanceof TypeError) return true;
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches `url` with the given `init` options, retrying on transient failures.
 *
 * Returns the raw `Response` object so callers can inspect headers (e.g.
 * Retry-After) or stream the body. On the last retry attempt the response is
 * returned unconditionally — callers should check `response.ok` and handle
 * errors themselves. Network errors on the last attempt are thrown.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  config: RetryConfig = {},
): Promise<Response> {
  const { maxRetries, initialDelayMs, maxDelayMs, onRetry } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

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
