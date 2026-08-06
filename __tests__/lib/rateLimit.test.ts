/**
 * lib/rateLimit.ts is the fix for issue #658: two API routes used to keep
 * their own module-level `Map` for rate-limit counters, which is only
 * authoritative within a single serverless instance. These tests simulate
 * that "multiple warm instances" scenario directly:
 *
 *  - The OLD approach (recreated inline below, since the routes no longer
 *    contain it) is shown to over-admit: N independent per-instance Maps
 *    let roughly `limit * N` requests through instead of `limit`.
 *  - The NEW approach (lib/rateLimit.ts backed by a mocked Redis client)
 *    is shown to enforce the limit exactly, regardless of how many
 *    independent "instances" — each with its own cold module state —
 *    call into it, because the mock models a shared external store the
 *    way real Upstash Redis is shared across serverless instances.
 */

// ── Mock @upstash/redis with a shared backing store ─────────────────────────
//
// Each `new Redis({ url, token })` call in the real client talks to the
// same external Upstash database when given the same url/token — that's
// exactly what makes it work across serverless instances. The mock models
// that: instances are keyed by `${url}:${token}` into one map that lives
// inside the mock module itself (jest.mock factories can't close over
// outer-scope variables, so the map is exposed as a named export instead
// and read back below via jest.requireMock). Constructing a "new" client
// (as a cold-started instance would) still sees the same counters as every
// other client pointed at the same database.
type MockEntry = { count: number; expiresAt: number | null };

jest.mock('@upstash/redis', () => {
  const backingStores = new Map<string, Map<string, MockEntry>>();

  class MockRedis {
    private store: Map<string, MockEntry>;

    constructor(opts: { url: string; token: string }) {
      const backingKey = `${opts.url}:${opts.token}`;
      let store = backingStores.get(backingKey);
      if (!store) {
        store = new Map<string, MockEntry>();
        backingStores.set(backingKey, store);
      }
      this.store = store;
    }

    async incr(key: string): Promise<number> {
      const entry = this.store.get(key);
      if (
        !entry ||
        (entry.expiresAt !== null && Date.now() >= entry.expiresAt)
      ) {
        this.store.set(key, { count: 1, expiresAt: null });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    }

    async expire(key: string, seconds: number): Promise<number> {
      const entry = this.store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }

    async pttl(key: string): Promise<number> {
      const entry = this.store.get(key);
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.max(0, entry.expiresAt - Date.now());
    }
  }

  return { Redis: MockRedis, __mockBackingStores: backingStores };
});

import { checkRateLimit, _resetRateLimitStoreForTests } from '@/lib/rateLimit';

const { __mockBackingStores } = jest.requireMock('@upstash/redis') as {
  __mockBackingStores: Map<string, Map<string, MockEntry>>;
};

describe('rateLimit under multiple "serverless instances" (issue #658)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __mockBackingStores.clear();
    _resetRateLimitStoreForTests();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetRateLimitStoreForTests();
  });

  it('OLD per-instance in-memory Map approach over-admits across instances', () => {
    // This recreates the exact logic app/api/players/search/route.ts and
    // app/api/ipfs/upload/route.ts used to have, before this fix, to prove
    // what the bug actually was: each "instance" is a fresh closure over
    // its own Map, just like a fresh serverless function instance would
    // get its own fresh module state.
    function makeOldPerInstanceLimiter(limit: number, windowMs: number) {
      const map = new Map<string, { count: number; firstSeen: number }>();
      return (ip: string) => {
        const now = Date.now();
        const entry = map.get(ip);
        if (!entry || now - entry.firstSeen > windowMs) {
          map.set(ip, { count: 1, firstSeen: now });
          return { limited: false };
        }
        entry.count += 1;
        if (entry.count > limit) return { limited: true };
        return { limited: false };
      };
    }

    const limit = 5;
    const windowMs = 10_000;
    const instanceCount = 4;
    const instances = Array.from({ length: instanceCount }, () =>
      makeOldPerInstanceLimiter(limit, windowMs),
    );

    const ip = '203.0.113.9';
    let admitted = 0;
    const totalRequests = 40;
    for (let i = 0; i < totalRequests; i++) {
      // Round-robin across instances, the way a load balancer spreads
      // concurrent requests across warm serverless instances.
      const instance = instances[i % instanceCount];
      const result = instance(ip);
      if (!result.limited) admitted++;
    }

    // Each instance independently admits up to `limit` requests before
    // rate-limiting its own Map, so the group as a whole admits
    // `limit * instanceCount`, not `limit` — this is exactly the bug.
    expect(admitted).toBe(limit * instanceCount);
    expect(admitted).toBeGreaterThan(limit);
  });

  it('NEW shared-store checkRateLimit enforces the limit exactly, regardless of instance count', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

    const limit = 5;
    const windowMs = 10_000;
    const key = 'test-route:203.0.113.9';

    let admitted = 0;
    const totalRequests = 40;
    for (let i = 0; i < totalRequests; i++) {
      // Simulate a cold-started serverless instance on every call: clear
      // lib/rateLimit's cached store so it must build a brand new Redis
      // client (mirroring a real cold start), the way 40 requests spread
      // across many different warm instances would each start from empty
      // module state. Despite that, the mocked Redis client shares its
      // backing store by url/token — exactly like real Upstash Redis is
      // one shared database regardless of how many clients connect to it.
      _resetRateLimitStoreForTests();
      const result = await checkRateLimit(key, { limit, windowMs });
      if (!result.limited) admitted++;
    }

    // Exactly `limit` requests admitted — not `limit * instanceCount` —
    // because every "instance" shares the same counter via the store.
    expect(admitted).toBe(limit);
  });

  it('returns limited:true with a positive retryAfterSec once the shared limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

    const limit = 3;
    const windowMs = 10_000;
    const key = 'test-route:198.51.100.7';

    let lastResult;
    for (let i = 0; i < limit + 1; i++) {
      lastResult = await checkRateLimit(key, { limit, windowMs });
    }

    expect(lastResult).toEqual(
      expect.objectContaining({
        limited: true,
        retryAfterSec: expect.any(Number),
      }),
    );
    expect(lastResult!.retryAfterSec).toBeGreaterThan(0);
  });

  it('tracks separate keys independently in the shared Redis-backed store', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

    const limit = 2;
    const windowMs = 10_000;

    await checkRateLimit('route-a:1.1.1.1', { limit, windowMs });
    await checkRateLimit('route-a:1.1.1.1', { limit, windowMs });
    const overLimit = await checkRateLimit('route-a:1.1.1.1', {
      limit,
      windowMs,
    });
    expect(overLimit.limited).toBe(true);

    // A different key (different route prefix, same IP) must be unaffected.
    const otherRoute = await checkRateLimit('route-b:1.1.1.1', {
      limit,
      windowMs,
    });
    expect(otherRoute.limited).toBe(false);

    // A different IP under the same route prefix must also be unaffected.
    const otherIp = await checkRateLimit('route-a:2.2.2.2', {
      limit,
      windowMs,
    });
    expect(otherIp.limited).toBe(false);
  });

  it('falls back to an in-memory limiter (and still enforces it) when Redis env vars are unset outside production', async () => {
    // UPSTASH_REDIS_REST_URL/TOKEN are deleted in beforeEach; NODE_ENV is
    // 'test' under Jest, i.e. not 'production'.
    const limit = 2;
    const windowMs = 10_000;
    const key = 'in-memory-fallback:9.9.9.9';

    expect((await checkRateLimit(key, { limit, windowMs })).limited).toBe(
      false,
    );
    expect((await checkRateLimit(key, { limit, windowMs })).limited).toBe(
      false,
    );
    const third = await checkRateLimit(key, { limit, windowMs });
    expect(third.limited).toBe(true);
  });

  it('logs a loud warning (once) and still degrades to in-memory, rather than failing closed, when Redis is unset in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const limit = 100;
      const windowMs = 10_000;

      // Multiple calls should only warn once, not spam per-request.
      await checkRateLimit('prod-no-redis:1.2.3.4', { limit, windowMs });
      await checkRateLimit('prod-no-redis:1.2.3.4', { limit, windowMs });
      const result = await checkRateLimit('prod-no-redis:1.2.3.4', {
        limit,
        windowMs,
      });

      // Does not fail closed — the request is still served (not limited,
      // since we're well under `limit`), just via the documented
      // best-effort in-memory fallback.
      expect(result.limited).toBe(false);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toEqual(
        expect.stringContaining('UPSTASH_REDIS_REST_URL'),
      );
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true,
      });
      errorSpy.mockRestore();
    }
  });
});
