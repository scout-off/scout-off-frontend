import { mutate as globalMutate } from 'swr';
import type { ContactDetails } from '@/types';

/**
 * Storage and lifetime policy for unlocked player contact details (email,
 * phone, telegram — see ContactDetails in types/index.ts). Full rationale:
 * docs/contact-details-privacy.md.
 *
 * Summary of the policy this module enforces:
 *   - Contact details live ONLY in SWR's default in-memory cache. Nothing
 *     here writes to localStorage/IndexedDB/a service worker cache, and no
 *     SWRConfig `provider` is configured anywhere in the app that would
 *     persist this cache — see the test in
 *     __tests__/lib/contactDetailsCache.test.ts that guards against that
 *     regression.
 *   - Every cache entry gets a bounded lifetime (CONTACT_DETAILS_TTL_MS):
 *     it self-purges even if the scout leaves the tab open indefinitely.
 *   - Wallet disconnect (context/WalletContext.tsx's `disconnect`) calls
 *     purgeAllContactDetails() for an immediate, deterministic wipe, on top
 *     of its existing blanket SWR cache clear.
 *
 * Do not add a persistent cache provider (localStorage, IndexedDB, etc.)
 * scoped to the `contact:` key prefix used here, even for offline/queueing
 * features — that would reintroduce exactly the PII-leakage risk this
 * module exists to prevent.
 */

/**
 * How long an unlocked contact-details cache entry survives before being
 * purged automatically, even if the scout never navigates away or
 * explicitly logs out.
 */
export const CONTACT_DETAILS_TTL_MS = 15 * 60 * 1000; // 15 minutes

const KEY_PREFIX = 'contact:';

export function contactDetailsKey(
  playerId: string,
  scoutWallet: string,
): string {
  return `${KEY_PREFIX}${playerId}:${scoutWallet}`;
}

function isContactDetailsKey(key: unknown): key is string {
  return typeof key === 'string' && key.startsWith(KEY_PREFIX);
}

// Tracks the auto-purge timer for each currently-cached key so a repeat
// unlock() resets the window instead of stacking timers, and so an
// explicit purge can cancel pending timers rather than leaving them to
// fire (harmlessly, but needlessly) against an already-cleared entry.
const purgeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAutoPurge(key: string): void {
  const existing = purgeTimers.get(key);
  if (existing) clearTimeout(existing);
  purgeTimers.set(
    key,
    setTimeout(() => {
      purgeTimers.delete(key);
      globalMutate(key, undefined, { revalidate: false });
    }, CONTACT_DETAILS_TTL_MS),
  );
}

/**
 * Seeds the SWR cache with newly-unlocked contact details and (re)starts
 * this entry's TTL. This is the only way contact details should ever enter
 * the cache — there is deliberately no fetcher wired to `contact:*` keys,
 * since the data only exists after an on-chain pay_to_contact call, not a
 * re-fetchable GET.
 */
export function cacheContactDetails(
  key: string,
  details: ContactDetails,
): Promise<ContactDetails | undefined> {
  scheduleAutoPurge(key);
  return globalMutate(key, details, { revalidate: false }) as Promise<
    ContactDetails | undefined
  >;
}

/** Immediately purges a single cached contact-details entry. */
export function purgeContactDetails(key: string): Promise<void> {
  const timer = purgeTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    purgeTimers.delete(key);
  }
  return globalMutate(key, undefined, { revalidate: false }) as Promise<void>;
}

/**
 * Immediately purges every cached contact-details entry, for every
 * player/scout pair. Wired into wallet disconnect and available as a
 * standalone "clear my data" action.
 */
export function purgeAllContactDetails(): Promise<void> {
  for (const timer of purgeTimers.values()) clearTimeout(timer);
  purgeTimers.clear();
  return globalMutate(isContactDetailsKey, undefined, {
    revalidate: false,
  }) as unknown as Promise<void>;
}
