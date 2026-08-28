/**
 * Unit tests for lib/pwaCacheConfig.ts
 *
 * The exported `tunedRuntimeCaching` array is a pure config object — no
 * network calls, no side effects. Tests validate the cache names (regression
 * guard against accidental typos that would break cache invalidation) and
 * that the urlPattern regexes match the URLs they are designed for while
 * rejecting URLs that belong to a different entry.
 */
import { tunedRuntimeCaching } from '@/lib/pwaCacheConfig';

// ── Shape ─────────────────────────────────────────────────────────────────────

describe('tunedRuntimeCaching — overall shape', () => {
  it('exports an array with exactly three entries', () => {
    expect(Array.isArray(tunedRuntimeCaching)).toBe(true);
    expect(tunedRuntimeCaching).toHaveLength(3);
  });

  it('every entry has a urlPattern, handler, and options', () => {
    for (const entry of tunedRuntimeCaching) {
      expect(entry).toHaveProperty('urlPattern');
      expect(entry).toHaveProperty('handler');
      expect(entry).toHaveProperty('options');
    }
  });
});

// ── Font assets entry ─────────────────────────────────────────────────────────

describe('font-assets-cache entry', () => {
  const entry = tunedRuntimeCaching[0];

  it('uses CacheFirst handler', () => {
    expect(entry.handler).toBe('CacheFirst');
  });

  it('has the stable cache name font-assets-cache', () => {
    expect(entry.options.cacheName).toBe('font-assets-cache');
  });

  it('has a maxAgeSeconds of one year (365 days)', () => {
    expect(entry.options.expiration?.maxAgeSeconds).toBe(60 * 60 * 24 * 365);
  });

  it('matches woff2 font files', () => {
    expect(entry.urlPattern).toEqual(expect.any(RegExp));
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/fonts/myfont.woff2')).toBe(true);
    expect(pattern.test('/fonts/myfont.woff')).toBe(true);
    expect(pattern.test('/fonts/myfont.ttf')).toBe(true);
    expect(pattern.test('/fonts/myfont.eot')).toBe(true);
    expect(pattern.test('/fonts/myfont.otf')).toBe(true);
  });

  it('does not match non-font assets', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/images/photo.png')).toBe(false);
    expect(pattern.test('/api/players/1')).toBe(false);
    expect(pattern.test('/icons/icon-192.png')).toBe(false);
  });
});

// ── Icon assets entry ─────────────────────────────────────────────────────────

describe('icon-assets-cache entry', () => {
  const entry = tunedRuntimeCaching[1];

  it('uses CacheFirst handler', () => {
    expect(entry.handler).toBe('CacheFirst');
  });

  it('has the stable cache name icon-assets-cache', () => {
    expect(entry.options.cacheName).toBe('icon-assets-cache');
  });

  it('has a maxAgeSeconds of 180 days', () => {
    expect(entry.options.expiration?.maxAgeSeconds).toBe(60 * 60 * 24 * 180);
  });

  it('matches PNG and SVG icons under /icons/', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/icons/icon-192.png')).toBe(true);
    expect(pattern.test('/icons/icon-512.svg')).toBe(true);
    expect(pattern.test('/icons/favicon.ico')).toBe(true);
  });

  it('does not match icons outside the /icons/ path', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/images/logo.png')).toBe(false);
    expect(pattern.test('/api/players/1')).toBe(false);
  });

  it('does not match font files', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/fonts/myfont.woff2')).toBe(false);
  });
});

// ── Player/scout API data entry ───────────────────────────────────────────────

describe('player-scout-data-cache entry', () => {
  const entry = tunedRuntimeCaching[2];

  it('uses StaleWhileRevalidate handler', () => {
    expect(entry.handler).toBe('StaleWhileRevalidate');
  });

  it('has the stable cache name player-scout-data-cache', () => {
    expect(entry.options.cacheName).toBe('player-scout-data-cache');
  });

  it('has a maxAgeSeconds of 5 minutes', () => {
    expect(entry.options.expiration?.maxAgeSeconds).toBe(60 * 5);
  });

  it('matches /api/players/ and /api/scouts/ routes', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/api/players/GABC')).toBe(true);
    expect(pattern.test('/api/players/GABC/milestones')).toBe(true);
    expect(pattern.test('/api/scouts/GSCOUT')).toBe(true);
    expect(pattern.test('/api/scouts/GSCOUT/subscriptions')).toBe(true);
  });

  it('does not match unrelated API routes', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/api/notifications/read')).toBe(false);
    expect(pattern.test('/api/notification-preferences')).toBe(false);
    expect(pattern.test('/api/session')).toBe(false);
  });

  it('does not match icon or font assets', () => {
    const pattern = entry.urlPattern as RegExp;
    expect(pattern.test('/icons/icon-192.png')).toBe(false);
    expect(pattern.test('/fonts/myfont.woff2')).toBe(false);
  });
});

// ── Stability / regression guard ──────────────────────────────────────────────

describe('cache name stability — regression guard', () => {
  it('all cache names are non-empty strings', () => {
    for (const entry of tunedRuntimeCaching) {
      expect(typeof entry.options.cacheName).toBe('string');
      expect((entry.options.cacheName as string).length).toBeGreaterThan(0);
    }
  });

  it('each cache name is unique', () => {
    const names = tunedRuntimeCaching.map((e) => e.options.cacheName);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('cache names match the documented values exactly', () => {
    const names = tunedRuntimeCaching.map((e) => e.options.cacheName);
    expect(names).toEqual([
      'font-assets-cache',
      'icon-assets-cache',
      'player-scout-data-cache',
    ]);
  });
});
