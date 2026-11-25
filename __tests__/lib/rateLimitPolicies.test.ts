/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { _resetRateLimitStoreForTests } from '@/lib/rateLimit';
import {
  POLICIES,
  applyRateLimit,
  type RateLimitPolicy,
} from '@/lib/rateLimitPolicies';

const policy: RateLimitPolicy = {
  slug: 'test-policy',
  limit: 3,
  windowMs: 10_000,
  message: 'Slow down.',
};

function makeReq(ip = '203.0.113.7'): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    headers: { 'x-real-ip': ip },
  });
}

describe('applyRateLimit', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, VERCEL: '1' };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetRateLimitStoreForTests();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.useRealTimers();
  });

  it('returns null while under the limit', async () => {
    for (let i = 0; i < policy.limit; i++) {
      await expect(applyRateLimit(makeReq(), policy)).resolves.toBeNull();
    }
  });

  it('returns a 429 with Retry-After and the policy message over the limit', async () => {
    for (let i = 0; i < policy.limit; i++)
      await applyRateLimit(makeReq(), policy);
    const res = await applyRateLimit(makeReq(), policy);
    expect(res?.status).toBe(429);
    const retryAfter = res?.headers.get('Retry-After');
    expect(Number(retryAfter)).toBeGreaterThan(0);
    await expect(res?.json()).resolves.toEqual({
      error: policy.message,
      retryAfterSec: Number(retryAfter),
    });
  });

  it('does not share counters between policies with different slugs', async () => {
    const other: RateLimitPolicy = { ...policy, slug: 'other-policy' };
    for (let i = 0; i < policy.limit; i++)
      await applyRateLimit(makeReq(), policy);
    expect(await applyRateLimit(makeReq(), policy)).not.toBeNull();
    await expect(applyRateLimit(makeReq(), other)).resolves.toBeNull();
  });

  it('resets the counter after windowMs', async () => {
    jest.useFakeTimers();
    for (let i = 0; i < policy.limit; i++)
      await applyRateLimit(makeReq(), policy);
    expect(await applyRateLimit(makeReq(), policy)).not.toBeNull();
    jest.advanceTimersByTime(policy.windowMs + 1);
    await expect(applyRateLimit(makeReq(), policy)).resolves.toBeNull();
  });
});

describe('POLICIES registry', () => {
  const entries: RateLimitPolicy[] = Object.values(POLICIES);

  it('uses a unique slug for every policy', () => {
    const slugs = entries.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(Object.entries(POLICIES))('%s has sane limits', (_name, p) => {
    expect(p.limit).toBeGreaterThan(0);
    expect(p.windowMs).toBeGreaterThanOrEqual(1000);
    expect(p.message.trim()).not.toBe('');
  });
});
