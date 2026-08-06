import { NextRequest } from 'next/server';

/** Real client IP from x-forwarded-for (preferred) or x-real-ip. */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

interface RateEntry {
  count: number;
  firstSeen: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSec?: number;
}

/**
 * Creates an in-memory, fixed-window per-IP rate limiter. Each call site
 * (e.g. one per upload route) gets its own independent counter map — pass a
 * `limit` sized to how many requests a legitimate use of that route makes
 * (a single chunked upload issues many small chunk requests, so that route
 * needs a much higher ceiling than a one-shot whole-file upload).
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const map = new Map<string, RateEntry>();

  return function checkRateLimit(ip: string): RateLimitResult {
    const now = Date.now();
    const entry = map.get(ip);

    if (!entry || now - entry.firstSeen > windowMs) {
      map.set(ip, { count: 1, firstSeen: now });
      return { limited: false };
    }

    entry.count += 1;
    map.set(ip, entry);

    if (entry.count > limit) {
      const retryAfterSec = Math.ceil(
        (windowMs - (now - entry.firstSeen)) / 1000,
      );
      return { limited: true, retryAfterSec };
    }

    return { limited: false };
  };
}
