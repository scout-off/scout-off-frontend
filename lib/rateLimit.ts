import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';

/**
 * Shared rate limiter used by API routes that need per-IP throttling
 * (app/api/players/search/route.ts, app/api/ipfs/upload/route.ts, and any
 * future route with the same need).
 *
 * Why this file exists (issue #658): both routes used to keep their own
 * module-level `Map<string, ...>` as rate-limit state. On Vercel-style
 * serverless deployments, each warm function instance gets its own copy of
 * that module state. A client hammering the endpoint gets load-balanced
 * across N instances, each independently allowing up to `limit` requests —
 * so the *effective* limit becomes `limit * N`, not `limit`. That's a real
 * abuse-protection gap, not just a theoretical one.
 *
 * The fix: back the counter with Upstash Redis (a REST-based client, so it
 * works from serverless/edge runtimes without a persistent TCP connection)
 * when it's configured, so every instance increments the same counter. When
 * Redis isn't configured, fall back to an in-memory Map — see
 * `getStore()` below for exactly when that's acceptable and when it's not.
 */

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * What to do when the shared store (Redis) fails (issue #1699):
   * - `'allow'` (default): fail open, the request is allowed.
   * - `'deny'`: fail closed with a short `retryAfterSec`.
   * - `'local'`: fall back to a process-local in-memory limiter with the
   *   same key and limits (per-instance, but still protective).
   */
  onStoreError?: 'allow' | 'deny' | 'local';
}

export interface RateLimitResult {
  limited: boolean;
  /** Only set when `limited` is true. Seconds until the caller may retry. */
  retryAfterSec?: number;
}

interface RateLimitStore {
  /**
   * Increment the counter for `key`, creating a new window if none is
   * active, and report the post-increment count plus how much of the
   * current window remains.
   */
  increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; ttlMs: number }>;
}

// ── In-memory store (dev/test fallback) ─────────────────────────────────────

type RateEntry = { count: number; resetAt: number };

/** Hard cap on tracked keys; the oldest (first-inserted) key is dropped past it. */
export const IN_MEMORY_MAX_ENTRIES = 10_000;
/** Expired entries are swept every this many increments (no timers, so nothing is kept alive). */
export const IN_MEMORY_SWEEP_EVERY = 1_000;

class InMemoryStore implements RateLimitStore {
  private map = new Map<string, RateEntry>();
  private callsSinceSweep = 0;

  get size() {
    return this.map.size;
  }

  private sweep(now: number) {
    for (const [key, entry] of this.map) {
      if (now >= entry.resetAt) this.map.delete(key);
    }
  }

  async increment(key: string, windowMs: number) {
    const now = Date.now();

    if (++this.callsSinceSweep >= IN_MEMORY_SWEEP_EVERY) {
      this.callsSinceSweep = 0;
      this.sweep(now);
    }

    const entry = this.map.get(key);

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + windowMs;
      // Delete first so a renewed key moves to the end of insertion order.
      this.map.delete(key);
      this.map.set(key, { count: 1, resetAt });
      if (this.map.size > IN_MEMORY_MAX_ENTRIES) {
        const oldest = this.map.keys().next().value;
        if (oldest !== undefined) this.map.delete(oldest);
      }
      return { count: 1, ttlMs: windowMs };
    }

    entry.count += 1;
    return { count: entry.count, ttlMs: entry.resetAt - now };
  }
}

// ── Redis store (production / shared across instances) ─────────────────────

class RedisStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  /**
   * Lua script that atomically INCRs the key and sets the EXPIRE TTL on the
   * first hit in a window (issue #1493). Running INCR + EXPIRE as a single
   * Redis EVAL means the serverless process can't die between the two
   * commands and leave a key with no TTL — which would rate-limit that
   * client forever. Returns `{ count, ttlSec }` so the caller can derive
   * the remaining window.
   *
   * KEYS[1] = rate-limit key
   * ARGV[1] = window length in seconds
   */
  private static readonly INCR_EXPIRE_SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  return { count, tonumber(ARGV[1]) }
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  return { count, tonumber(ARGV[1]) }
end
return { count, math.floor(ttl / 1000) }`;

  async increment(key: string, windowMs: number) {
    // Fixed-window counter: INCR the key, and on the first hit in a window
    // set an EXPIRE so it resets after `windowMs`.
    //
    // Tradeoff vs. a sliding window: fixed windows allow up to 2x `limit`
    // requests across a window boundary (e.g. `limit` requests in the last
    // instant of one window plus `limit` more in the first instant of the
    // next). A sliding-log or sliding-window-counter algorithm avoids that
    // at the cost of extra Redis calls/state (a sorted set per key, or two
    // counters blended by elapsed-time weight). For per-IP abuse protection
    // on these routes, admitting up to 2x `limit` for a brief instant at a
    // window boundary is an acceptable tradeoff for the simplicity of a
    // single INCR/EXPIRE pair — revisit if these limits ever need to be
    // exact rather than "good enough to stop scripted abuse."
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
    const result = await this.redis.eval(
      RedisStore.INCR_EXPIRE_SCRIPT,
      [key],
      [String(windowSec)],
    );
    // eval returns [count, ttlSec] — coerce the JSON values to numbers.
    const arr = result as unknown[];
    const count = Number(arr[0]);
    const ttlSec = Number(arr[1]);
    const ttlMs = ttlSec > 0 ? ttlSec * 1000 : windowMs;
    return { count, ttlMs };
  }
}

// ── Store selection ──────────────────────────────────────────────────────────

let cachedStore: RateLimitStore | null = null;
let warnedMissingRedisInProd = false;

function buildStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new RedisStore(new Redis({ url, token }));
  }

  // No Redis configured. This is expected (and fine) in local dev/test —
  // NODE_ENV !== 'production' — where a single process is the only
  // "instance" anyway, so an in-memory Map is fully authoritative.
  //
  // In production, though, this in-memory fallback is NOT globally
  // authoritative: it's scoped to a single serverless instance, which is
  // exactly the bug this file exists to fix (see the file-level comment
  // above). We intentionally do NOT hard-fail the request or fail closed
  // (treating every request as rate-limited) here — an outage of the rate
  // limiter shouldn't take down the whole route. Instead we log loudly
  // (once, not per-request) so the misconfiguration is visible in
  // production logs/alerts, and degrade to best-effort, per-instance
  // limiting rather than no limiting at all. Configure
  // UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN to get the real,
  // shared-across-instances guarantee back.
  if (process.env.NODE_ENV === 'production' && !warnedMissingRedisInProd) {
    warnedMissingRedisInProd = true;
    console.error(
      '[rateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set in ' +
        'production. Falling back to an in-memory, per-instance rate limiter. This is ' +
        'NOT globally authoritative: under concurrent traffic spread across N warm ' +
        'serverless instances, the effective limit is approximately `limit * N`, not ' +
        '`limit`. Configure Upstash Redis (see .env.example) to restore a shared, ' +
        'globally-enforced rate limit.',
    );
  }

  return new InMemoryStore();
}

function getStore(): RateLimitStore {
  if (!cachedStore) {
    cachedStore = buildStore();
  }
  return cachedStore;
}

/**
 * Test-only escape hatch: clears the cached store (and the "already warned"
 * flag) so each test can start from a clean slate and re-evaluate env vars.
 * Not used by application code.
 */
export function _resetRateLimitStoreForTests(): void {
  cachedStore = null;
  warnedMissingRedisInProd = false;
}

/**
 * Test-only: number of keys tracked by the in-memory store, or null when the
 * active store isn't the in-memory one. Not used by application code.
 */
export function _getInMemoryStoreSizeForTests(): number | null {
  return cachedStore instanceof InMemoryStore ? cachedStore.size : null;
}

// ── Store failure handling (issue #1699) ─────────────────────────────────────

/** Consecutive store failures that open the circuit breaker. */
export const BREAKER_FAILURE_THRESHOLD = 3;
/** How long the breaker stays open (store skipped) once tripped. */
export const BREAKER_OPEN_MS = 10_000;
/** Minimum interval between store-failure log lines. */
export const STORE_ERROR_LOG_INTERVAL_MS = 60_000;
/** `retryAfterSec` returned by `onStoreError: 'deny'`. */
export const DENY_RETRY_AFTER_SEC = 5;

let consecutiveFailures = 0;
let breakerOpenUntil = 0;
let storeErrorCount = 0;
let lastStoreErrorLogAt = 0;
let localFallbackStore: InMemoryStore | null = null;

function getLocalFallbackStore(): InMemoryStore {
  if (!localFallbackStore) localFallbackStore = new InMemoryStore();
  return localFallbackStore;
}

function recordStoreError(err: unknown) {
  storeErrorCount += 1;
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_OPEN_MS;
  }
  const now = Date.now();
  if (now - lastStoreErrorLogAt >= STORE_ERROR_LOG_INTERVAL_MS) {
    lastStoreErrorLogAt = now;
    console.error(
      `[rateLimit] store.increment failed (rate_limit_store_errors_total=${storeErrorCount}):`,
      err,
    );
  }
}

/** Test-only: resets breaker, failure counters and the local fallback store. */
export function _resetRateLimitBreakerForTests(): void {
  consecutiveFailures = 0;
  breakerOpenUntil = 0;
  storeErrorCount = 0;
  lastStoreErrorLogAt = 0;
  localFallbackStore = null;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Check (and consume) one unit of rate-limit budget for `key`.
 *
 * `key` should namespace by both the caller (e.g. route name) and the
 * client identity (e.g. IP) — callers here use keys like
 * `players-search:<ip>` and `ipfs-upload:<ip>` so the two routes' limits
 * never collide with each other in a shared store.
 *
 * Store errors are handled per `opts.onStoreError` (default `'allow'`,
 * i.e. fail open as in issue #1493). Failures are logged at a bounded rate,
 * and after repeated failures a circuit breaker skips the store for
 * `BREAKER_OPEN_MS` instead of retrying it on every request (issue #1699).
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const store = getStore();

  let count: number;
  let ttlMs: number;
  try {
    if (Date.now() < breakerOpenUntil) {
      throw new Error('rate-limit store circuit breaker open');
    }
    ({ count, ttlMs } = await store.increment(key, opts.windowMs));
    consecutiveFailures = 0;
  } catch (err) {
    if (Date.now() >= breakerOpenUntil) recordStoreError(err);
    const mode = opts.onStoreError ?? 'allow';
    if (mode === 'deny') {
      return { limited: true, retryAfterSec: DENY_RETRY_AFTER_SEC };
    }
    if (mode === 'allow' || store instanceof InMemoryStore) {
      return { limited: false };
    }
    ({ count, ttlMs } = await getLocalFallbackStore().increment(
      key,
      opts.windowMs,
    ));
  }

  if (count > opts.limit) {
    return { limited: true, retryAfterSec: Math.ceil(ttlMs / 1000) };
  }

  return { limited: false };
}

export { getClientIp } from './clientIp';
