/**
 * Issue #1699: per-policy failure modes when the shared rate-limit store
 * (Upstash Redis) is unavailable, plus the circuit breaker and bounded logs.
 */
const mockEval = jest.fn();

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    eval: (...args: unknown[]) => mockEval(...args),
  })),
}));

import {
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_OPEN_MS,
  DENY_RETRY_AFTER_SEC,
  checkRateLimit,
  _resetRateLimitBreakerForTests,
  _resetRateLimitStoreForTests,
} from '@/lib/rateLimit';
import { POLICIES } from '@/lib/rateLimitPolicies';

describe('checkRateLimit onStoreError', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    _resetRateLimitStoreForTests();
    _resetRateLimitBreakerForTests();
    mockEval.mockReset();
    mockEval.mockRejectedValue(new Error('redis down'));
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    errorSpy.mockRestore();
    jest.useRealTimers();
  });

  it("defaults to 'allow' (fail open)", async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        await checkRateLimit('k:allow', { limit: 1, windowMs: 60_000 }),
      ).toEqual({ limited: false });
    }
  });

  it("'deny' fails closed with a short retryAfterSec", async () => {
    expect(
      await checkRateLimit('k:deny', {
        limit: 10,
        windowMs: 60_000,
        onStoreError: 'deny',
      }),
    ).toEqual({ limited: true, retryAfterSec: DENY_RETRY_AFTER_SEC });
  });

  it("'local' still enforces auth policies via the in-memory fallback", async () => {
    const { limit, windowMs, onStoreError } = POLICIES.authRefresh;
    expect(onStoreError).toBe('local');
    for (let i = 0; i < limit; i++) {
      const r = await checkRateLimit('auth-refresh:1.2.3.4', {
        limit,
        windowMs,
        onStoreError,
      });
      expect(r.limited).toBe(false);
    }
    const blocked = await checkRateLimit('auth-refresh:1.2.3.4', {
      limit,
      windowMs,
      onStoreError,
    });
    expect(blocked.limited).toBe(true);
  });

  it('applies the local fallback to every sensitive policy', () => {
    for (const p of [
      POLICIES.authSep10,
      POLICIES.authRefresh,
      POLICIES.authLogoutAll,
      POLICIES.contactRelease,
      POLICIES.contactVaultUpload,
    ]) {
      expect(p.onStoreError).toBe('local');
    }
  });

  it('opens a circuit breaker after repeated failures', async () => {
    jest.useFakeTimers();
    const opts = { limit: 100, windowMs: 60_000 };
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      await checkRateLimit('k:breaker', opts);
    }
    expect(mockEval).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);

    await checkRateLimit('k:breaker', opts);
    await checkRateLimit('k:breaker', opts);
    expect(mockEval).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);

    jest.advanceTimersByTime(BREAKER_OPEN_MS);
    mockEval.mockResolvedValue([1, 60]);
    await checkRateLimit('k:breaker', opts);
    expect(mockEval).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD + 1);
  });

  it('logs store failures at a bounded rate', async () => {
    for (let i = 0; i < 20; i++) {
      await checkRateLimit('k:log', { limit: 100, windowMs: 60_000 });
    }
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
