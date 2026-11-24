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
 *
 * Issue #1700 extends the library with a sliding-window counter algorithm.
 * Tests for that algorithm are grouped in a dedicated describe block below.
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
      if (!entry || (entry.expiresAt !== null && Date.now() >= entry.expiresAt)) {
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

    // Minimal Lua eval simulation for the sliding-window INCR+GET script.
    // The script: INCR KEYS[1], optionally EXPIRE with ARGV[1], GET KEYS[2].
    // Returns [currentCount, prevCount].
    async eval(
      _script: string,
      keys: string[],
      argv: string[],
    ): Promise<[number, number]> {
      const currKey = keys[0];
      const prevKey = keys[1];
      const ttlSec = Number(argv[0]);

      // INCR current key
      const currEntry = this.store.get(currKey);
      let currCount: number;
      if (!currEntry || (currEntry.expiresAt !== null && Date.now() >= currEntry.expiresAt)) {
        this.store.set(currKey, { count: 1, expiresAt: Date.now() + ttlSec * 1000 });
        currCount = 1;
      } else {
        currEntry.count += 1;
        currCount = currEntry.count;
      }

      // GET previous key
      const prevEntry = this.store.get(prevKey);
      let prevCount = 0;
      if (prevEntry && !(prevEntry.expiresAt !== null && Date.now() >= prevEntry.expiresAt)) {
        prevCount = prevEntry.count;
      }

      return [currCount, prevCount];
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
      expect.objectContaining({ limited: true, retryAfterSec: expect.any(Number) }),
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
    const overLimit = await checkRateLimit('route-a:1.1.1.1', { limit, windowMs });
    expect(overLimit.limited).toBe(true);

    // A different key (different route prefix, same IP) must be unaffected.
    const otherRoute = await checkRateLimit('route-b:1.1.1.1', { limit, windowMs });
    expect(otherRoute.limited).toBe(false);

    // A different IP under the same route prefix must also be unaffected.
    const otherIp = await checkRateLimit('route-a:2.2.2.2', { limit, windowMs });
    expect(otherIp.limited).toBe(false);
  });

  it('falls back to an in-memory limiter (and still enforces it) when Redis env vars are unset outside production', async () => {
    // UPSTASH_REDIS_REST_URL/TOKEN are deleted in beforeEach; NODE_ENV is
    // 'test' under Jest, i.e. not 'production'.
    const limit = 2;
    const windowMs = 10_000;
    const key = 'in-memory-fallback:9.9.9.9';

    expect((await checkRateLimit(key, { limit, windowMs })).limited).toBe(false);
    expect((await checkRateLimit(key, { limit, windowMs })).limited).toBe(false);
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

// ── Sliding-window counter tests (issue #1700) ───────────────────────────────

describe('sliding-window algorithm (issue #1700)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __mockBackingStores.clear();
    _resetRateLimitStoreForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetRateLimitStoreForTests();
    jest.useRealTimers();
  });

  // ── In-memory sliding window ────────────────────────────────────────────

  describe('in-memory store', () => {
    it('limits after `limit` requests within a single window', async () => {
      // The sliding-window formula rejects when estimated >= limit, so the
      // limit-th request (count === limit, estimate === limit) is blocked.
      // Exactly limit-1 requests are admitted before the first rejection.
      const limit = 5;
      const windowMs = 10_000;
      const key = 'sliding-mem:1.2.3.4';

      let admitted = 0;
      for (let i = 0; i < limit + 2; i++) {
        const result = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
        if (!result.limited) admitted++;
      }

      // The estimate hits `limit` on the limit-th call (>= rejects), so
      // limit-1 calls are admitted (not limit as in fixed-window's > check).
      expect(admitted).toBe(limit - 1);
    });

    it('bounds boundary burst to ~limit (not 2× limit) unlike fixed window', async () => {
      // With a fixed window a client can send `limit` requests at the very end
      // of one window and `limit` more at the very start of the next — 2×limit
      // in a short span. The sliding window weights the previous window's count
      // by elapsed fraction, so the total stays close to `limit`.
      //
      // For the in-memory store we verify mid-window throttling: at 50% elapsed
      // the previous window contributes half its count. If the previous window
      // is fully saturated, the blended estimate from the new window should
      // exceed the limit well before `limit` new requests are made.
      const limit = 10;
      const windowMs = 10_000;
      const key = 'sliding-boundary:5.6.7.8';

      jest.setSystemTime(0);

      // Fill window 1 to limit-1 (the last admitted count before >= rejects)
      for (let i = 0; i < limit - 1; i++) {
        await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      }

      // Jump to 50% into the next window. Previous window contributed (limit-1)
      // requests. At elapsed = windowMs/2:
      //   estimated = currentCount + (limit-1) * (1 - 0.5) = currentCount + (limit-1)*0.5
      // With currentCount=1 on the first request: 1 + 4.5 = 5.5 < 10, admitted.
      // But we won't be able to reach `limit` new requests before the estimate
      // crosses the threshold — fewer than `limit` are admitted.
      jest.setSystemTime(windowMs + windowMs / 2); // 50% into window 2

      let admittedInNewWindow = 0;
      for (let i = 0; i < limit + 5; i++) {
        const result = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
        if (!result.limited) admittedInNewWindow++;
      }

      // With a full previous window, we can admit fewer than `limit` new
      // requests in the new window — that's the point: bounded at ~limit total.
      expect(admittedInNewWindow).toBeLessThan(limit);
      expect(admittedInNewWindow).toBeGreaterThan(0);
    });

    it('allows requests again after the previous window fully decays', async () => {
      const limit = 5;
      const windowMs = 10_000;
      const key = 'sliding-decay:9.10.11.12';

      jest.setSystemTime(0);

      // Fill window 1
      for (let i = 0; i < limit; i++) {
        await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      }

      // Advance two full windows. The previous window's count has fully
      // decayed; a fresh budget is available.
      jest.setSystemTime(windowMs * 2 + 1);
      _resetRateLimitStoreForTests();

      const result = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      expect(result.limited).toBe(false);
    });

    it('returns a positive retryAfterSec when limited', async () => {
      const limit = 3;
      const windowMs = 10_000;
      const key = 'sliding-retry:3.3.3.3';

      for (let i = 0; i < limit; i++) {
        await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      }

      const limited = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      expect(limited.limited).toBe(true);
      expect(limited.retryAfterSec).toBeDefined();
      expect(limited.retryAfterSec!).toBeGreaterThan(0);
    });

    it('tracks sliding and fixed keys independently under the same store', async () => {
      const limit = 3;
      const windowMs = 10_000;

      // Exhaust a sliding key
      for (let i = 0; i < limit; i++) {
        await checkRateLimit('shared-sliding:1.1.1.1', { limit, windowMs, algorithm: 'sliding' });
      }
      const slidingLimited = await checkRateLimit('shared-sliding:1.1.1.1', {
        limit,
        windowMs,
        algorithm: 'sliding',
      });
      expect(slidingLimited.limited).toBe(true);

      // A fixed-window key with a different namespace is unaffected
      const fixedResult = await checkRateLimit('shared-fixed:1.1.1.1', { limit, windowMs });
      expect(fixedResult.limited).toBe(false);
    });
  });

  // ── Redis sliding window ─────────────────────────────────────────────────

  describe('Redis store', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    });

    it('limits after `limit` requests within a single window (Redis)', async () => {
      // Same >= semantics as in-memory: limit-1 admitted before first rejection.
      const limit = 5;
      const windowMs = 10_000;
      const key = 'redis-sliding:10.0.0.1';

      let admitted = 0;
      for (let i = 0; i < limit + 3; i++) {
        const result = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
        if (!result.limited) admitted++;
      }

      expect(admitted).toBe(limit - 1);
    });

    it('bounds boundary burst to ~limit (not 2× limit) in Redis store', async () => {
      const limit = 10;
      const windowMs = 10_000;
      const key = 'redis-boundary:10.0.0.2';

      jest.setSystemTime(0);

      // Fill the previous window to the limit
      for (let i = 0; i < limit; i++) {
        await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      }

      // Confirm exhausted
      const atEnd = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      expect(atEnd.limited).toBe(true);

      // Jump to start of next window — previous window still contributes
      jest.setSystemTime(windowMs);
      _resetRateLimitStoreForTests();

      // Re-set env after store reset
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

      const firstOfNewWindow = await checkRateLimit(key, {
        limit,
        windowMs,
        algorithm: 'sliding',
      });
      expect(firstOfNewWindow.limited).toBe(true);
    });

    it('returns a positive retryAfterSec when limited (Redis)', async () => {
      const limit = 3;
      const windowMs = 10_000;
      const key = 'redis-retry:10.0.0.3';

      for (let i = 0; i < limit; i++) {
        await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      }

      const limited = await checkRateLimit(key, { limit, windowMs, algorithm: 'sliding' });
      expect(limited.limited).toBe(true);
      expect(limited.retryAfterSec).toBeDefined();
      expect(limited.retryAfterSec!).toBeGreaterThan(0);
    });

    it('algorithm defaults to fixed when not specified', async () => {
      const limit = 5;
      const windowMs = 10_000;
      const key = 'default-fixed:10.0.0.4';

      let admitted = 0;
      for (let i = 0; i < limit + 2; i++) {
        // No algorithm field — should use fixed window
        const result = await checkRateLimit(key, { limit, windowMs });
        if (!result.limited) admitted++;
      }

      expect(admitted).toBe(limit);
    });
  });
});
