/**
 * Shared PII scrubbing for every Sentry runtime (client, server, edge).
 *
 * Applied to error events (`beforeSend`), performance transactions
 * (`beforeSendTransaction`) and breadcrumbs (`beforeBreadcrumb`). See
 * docs/sentry-pii-scrubbing.md for what is redacted and why.
 */

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  // Stellar secret seeds — should never appear, but be defensive.
  [/\bS[A-Z2-7]{55}\b/g, '[secret_seed]'],
  // Muxed (M…) Stellar addresses.
  [/\bM[A-Z2-7]{68}\b/g, '[wallet_address]'],
  // Stellar public keys (G…).
  [/\bG[A-Z2-7]{55}\b/g, '[wallet_address]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // E.164 phone numbers, also when URL-encoded (%2B).
  [/(?:\+|%2B)[1-9]\d{7,14}\b/gi, '[phone]'],
];

/** Redacts wallet addresses, secret seeds, emails and phone numbers. */
export function scrubString(value: string): string {
  let out = value;
  for (const [re, replacement] of REDACTIONS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, seen));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[scrubString(key)] = scrubValue(v, seen);
  }
  return out;
}

/** Deep-copies `input`, scrubbing every string (keys included). */
export function scrubDeep<T>(input: T): T {
  return scrubValue(input, new WeakSet()) as T;
}

interface RequestLike {
  cookies?: unknown;
  headers?: Record<string, unknown>;
}

/**
 * Scrubs an error or transaction event and strips cookies. Returns `null`
 * (drop the event) if scrubbing throws, so PII is never sent unscrubbed.
 */
export function scrubEvent<T extends object>(event: T): T | null {
  try {
    const scrubbed = scrubDeep(event) as T & { request?: RequestLike };
    const request = scrubbed.request;
    if (request) {
      delete request.cookies;
      if (request.headers) {
        for (const key of Object.keys(request.headers)) {
          if (key.toLowerCase() === 'cookie') delete request.headers[key];
        }
      }
    }
    return scrubbed;
  } catch {
    return null;
  }
}

/** Scrubs a breadcrumb (fetch URLs, console messages, data). */
export function scrubBreadcrumb<T extends object>(crumb: T): T | null {
  try {
    return scrubDeep(crumb);
  } catch {
    return null;
  }
}
