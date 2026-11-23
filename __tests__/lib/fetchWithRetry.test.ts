/**
 * Unit tests for lib/fetchWithRetry.ts
 *
 * Covers:
 * - Successful fetch on first attempt
 * - Retry on 5xx transient errors, then success
 * - No retry on 4xx client errors
 * - No retry on non-TypeError exceptions
 * - Retry on network errors (TypeError), then success
 * - Exponential backoff schedule (delay doubles each attempt)
 * - Capped max delay
 * - Exhaustion of retries (last attempt returns response)
 * - fetchJsonWithRetry convenience wrapper
 * - Default and custom retry configs
 */

import { fetchWithRetry, fetchJsonWithRetry } from '@/lib/fetchWithRetry';

const DEFAULT_URL = 'https://api.example.com/resource';

function mockFetchOnce(
  status: number,
  body?: unknown,
  ok?: boolean,
): jest.Mock {
  return (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: ok ?? (status >= 200 && status < 300),
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body ?? {},
    headers: new Headers(),
  });
}

function mockFetchRejectOnce(error: unknown): jest.Mock {
  return (global.fetch as jest.Mock).mockRejectedValueOnce(error);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Basic success ─────────────────────────────────────────────────────────────

describe('fetchWithRetry – basic success', () => {
  it('resolves with the response on the first attempt for a 200', async () => {
    mockFetchOnce(200, { data: 'ok' });

    const response = await fetchWithRetry(DEFAULT_URL);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });
});

// ── Retry on 5xx ──────────────────────────────────────────────────────────────

describe('fetchWithRetry – retry on 5xx', () => {
  it('retries on 500 and succeeds on the next attempt', async () => {
    mockFetchOnce(500); // first fails
    mockFetchOnce(200, { data: 'recovered' }); // retry succeeds

    const promise = fetchWithRetry(DEFAULT_URL);

    // Advance past the backoff delay (~500ms + jitter)
    await jest.advanceTimersByTimeAsync(1000);

    const response = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  }, 10_000);

  it('returns the last 5xx response when all retries are exhausted', async () => {
    // 4 calls: initial + 3 retries, all 5xx
    mockFetchOnce(500);
    mockFetchOnce(502);
    mockFetchOnce(503);
    mockFetchOnce(500);

    const promise = fetchWithRetry(DEFAULT_URL, {}, { maxRetries: 3 });

    // Advance past all backoff delays (~500 + ~1000 + ~2000 = ~3500ms)
    await jest.advanceTimersByTimeAsync(10_000);

    const response = await promise;
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(4); // initial + 3 retries
  }, 15_000);

  it('retries with custom maxRetries and returns response on exhaustion', async () => {
    mockFetchOnce(500);
    mockFetchOnce(502);

    const promise = fetchWithRetry(DEFAULT_URL, {}, { maxRetries: 1 });

    await jest.advanceTimersByTimeAsync(2000);

    const response = await promise;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(502);
  }, 10_000);
});

// ── No retry on 4xx ───────────────────────────────────────────────────────────

describe('fetchWithRetry – never retries 4xx', () => {
  it('returns the 4xx response immediately without retrying', async () => {
    mockFetchOnce(400, { error: 'Bad request' });

    const response = await fetchWithRetry(DEFAULT_URL);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });

  it('does not retry on 429 (rate limit)', async () => {
    mockFetchOnce(429, { error: 'Rate limited' });

    const response = await fetchWithRetry(DEFAULT_URL);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(429);
  });

  it('does not retry on 403 (forbidden)', async () => {
    mockFetchOnce(403, { error: 'Forbidden' });

    const response = await fetchWithRetry(DEFAULT_URL);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(403);
  });
});

// ── Retry on network errors ───────────────────────────────────────────────────

describe('fetchWithRetry – retry on network errors', () => {
  it('retries on TypeError (network failure) and recovers', async () => {
    mockFetchRejectOnce(new TypeError('Failed to fetch'));
    mockFetchOnce(200, { data: 'recovered' });

    const promise = fetchWithRetry(DEFAULT_URL);

    await jest.advanceTimersByTimeAsync(1000);

    const response = await promise;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
  }, 10_000);

  it('retries on consecutive TypeErrors and then throws on the last', async () => {
    // Use real timers to avoid microtask-ordering issues with fake timers
    jest.useRealTimers();

    (global.fetch as jest.Mock).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    await expect(
      fetchWithRetry(DEFAULT_URL, {}, { maxRetries: 2, initialDelayMs: 10 }),
    ).rejects.toThrow('Failed to fetch');

    expect(global.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
  it('does not retry on non-TypeError exceptions (e.g. programmer errors)', async () => {
    mockFetchRejectOnce(new Error('SyntaxError: Unexpected token'));

    await expect(fetchWithRetry(DEFAULT_URL)).rejects.toThrow(
      'SyntaxError: Unexpected token',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ── Exponential backoff schedule ──────────────────────────────────────────────

describe('fetchWithRetry – exponential backoff', () => {
  it('calls onRetry with increasing attempt numbers', async () => {
    // All fail — we need 4 calls total (initial + 3 retries)
    mockFetchOnce(500);
    mockFetchOnce(500);
    mockFetchOnce(500);
    mockFetchOnce(500);

    const onRetry = jest.fn();
    const promise = fetchWithRetry(
      DEFAULT_URL,
      {},
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10_000,
        onRetry,
      },
    );

    await jest.advanceTimersByTimeAsync(10_000);

    // Returns the last response since all retries exhausted
    const response = await promise;
    expect(response.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Object));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Object));
    expect(onRetry).toHaveBeenNthCalledWith(3, 3, expect.any(Object));
  }, 15_000);

  it('caps the delay at maxDelayMs', async () => {
    mockFetchOnce(500);
    mockFetchOnce(500);
    mockFetchOnce(500);
    mockFetchOnce(500);

    const onRetry = jest.fn();
    const promise = fetchWithRetry(
      DEFAULT_URL,
      {},
      {
        maxRetries: 3,
        initialDelayMs: 10_000, // would become 80s by attempt 4
        maxDelayMs: 15_000,
        onRetry,
      },
    );

    await jest.advanceTimersByTimeAsync(60_000);

    const response = await promise;
    expect(response.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  }, 65_000);
});

// ── fetchJsonWithRetry ────────────────────────────────────────────────────────

describe('fetchJsonWithRetry', () => {
  it('parses JSON on success', async () => {
    const data = { id: 1, name: 'Alice' };
    mockFetchOnce(200, data);

    const result = await fetchJsonWithRetry<typeof data>(DEFAULT_URL);

    expect(result).toEqual(data);
  });

  it('throws when the response is not ok (even after retries)', async () => {
    jest.useRealTimers();

    // All attempts return 500
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
      json: async () => ({ error: 'Server error' }),
      headers: new Headers(),
    });

    await expect(
      fetchJsonWithRetry(
        DEFAULT_URL,
        {},
        { maxRetries: 1, initialDelayMs: 10 },
      ),
    ).rejects.toThrow('Request failed: 500 Error');

    expect(global.fetch).toHaveBeenCalledTimes(2); // initial + 1 retry
  });
});

// ── Default config ────────────────────────────────────────────────────────────

describe('fetchWithRetry – default config', () => {
  it('uses default maxRetries=3 when no config is provided', async () => {
    mockFetchOnce(500);
    mockFetchOnce(500);
    mockFetchOnce(500);
    mockFetchOnce(500);

    const promise = fetchWithRetry(DEFAULT_URL);

    await jest.advanceTimersByTimeAsync(10_000);

    const response = await promise;
    expect(response.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  }, 15_000);
});
