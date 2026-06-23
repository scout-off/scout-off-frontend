interface Window {
  count: number;
  resetAt: number;
}

// Module-level store — persists for the lifetime of a serverless instance.
// Entries are pruned lazily to prevent unbounded growth.
const store = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // seconds until the window resets; 0 when allowed
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const win = store.get(key);

  if (!win || now >= win.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    pruneExpired(now);
    return { allowed: true, retryAfter: 0 };
  }

  if (win.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((win.resetAt - now) / 1000) };
  }

  win.count += 1;
  return { allowed: true, retryAfter: 0 };
}

// Exposed for test teardown only — do not call in production code.
export function _resetStore(): void {
  store.clear();
}

function pruneExpired(now: number): void {
  for (const [key, win] of store) {
    if (now >= win.resetAt) store.delete(key);
  }
}
