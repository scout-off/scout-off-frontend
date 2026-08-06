# Contact details: storage and access-lifetime policy

Design notes for how unlocked player `ContactDetails` (email, phone,
telegram — `types/index.ts`) are cached, enforced by
`lib/contactDetailsCache.ts` and consumed by `hooks/usePayToContact.ts` and
`components/scout/ContactModal.tsx`.

## Scope

This is a privacy/compliance-adjacent hardening task, not a caching tweak.
Contact details are exactly the kind of personal data that shouldn't
linger indefinitely in a browser's cache on a shared computer — a common
scenario for scouts working from academy or club shared machines in the
regions this product targets. The policy below exists so that no future
feature (offline queueing, a persisted-cache performance optimization,
etc.) accidentally reintroduces that risk without someone having to
rediscover why it matters.

## The policy

1. **Never persisted.** Contact details live only in SWR's default
   in-memory cache. Nothing in this codebase writes them to localStorage,
   IndexedDB, or a service worker cache, and no `SWRConfig` `provider`
   override is configured anywhere in the app (`app/layout.tsx` has none) —
   the default provider is a plain in-memory `Map` that's gone the moment
   the tab is closed or reloaded.
2. **Bounded lifetime, not just "until reload."** Even within one long-lived
   session, a cache entry doesn't survive forever: `cacheContactDetails`
   starts a `CONTACT_DETAILS_TTL_MS` (15 minute) timer on every unlock, and
   the entry is purged automatically when it elapses — whether or not the
   scout ever navigates away.
3. **Clearable on demand.** Two triggers, both immediate (no waiting on the
   TTL):
   - `context/WalletContext.tsx`'s `disconnect()` calls
     `purgeAllContactDetails()` on every logout, on top of its existing
     blanket SWR cache wipe.
   - `ContactModal`'s close button calls `usePayToContact`'s `clear()` —
     closing the dialog a scout opened to view a player's details purges
     that entry immediately, rather than leaving it cached until the TTL or
     a later logout.
4. **No fetcher.** The SWR key used for contact details
   (`contact:{playerId}:{scoutWallet}`, see `contactDetailsKey`) is never
   given a fetcher — there is no re-fetchable GET for already-unlocked PII,
   only the one-time on-chain `pay_to_contact` call. The only way data
   enters this cache is through `cacheContactDetails`, called once, right
   after that call resolves. This also means SWR's focus/reconnect
   revalidation can never re-request it.

## Where this runs

`hooks/usePayToContact.ts`'s `unlock()` does the on-chain call
(`lib/contract.ts`'s `payToContact`, via the wallet-agnostic `signOnly`
callback added to `WalletContext` for this purpose — the existing
`signAndSubmit` fires-and-forgets the transaction and never surfaces its
decoded return value, which is where the actual `ContactDetails` come
from), then calls `cacheContactDetails` to seed the SWR cache and start the
TTL. Any component that calls `usePayToContact(playerId)` for the same
player and connected wallet — not just the one that triggered `unlock()` —
reads the same cache entry, since the key is derived purely from
`(playerId, scoutWallet)` rather than component-local state. That's what
lets `ContactModal` display what a caller already unlocked without needing
to trigger (and pay for) `pay_to_contact` a second time.

| Trigger                          | Action                                           | Guarantee                                                                 |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `unlock()` resolves              | `cacheContactDetails(key, details)`              | Cache entry created; TTL timer (re)started                                |
| `CONTACT_DETAILS_TTL_MS` elapses | scheduled `purgeContactDetails`-equivalent purge | Entry cleared even with no user action                                    |
| `ContactModal` closed            | `usePayToContact().clear()`                      | That entry cleared immediately                                            |
| Wallet disconnect                | `purgeAllContactDetails()` + blanket SWR wipe    | Every `contact:*` entry cleared immediately, pending TTL timers cancelled |

## What not to do here

Do not add a persistent cache provider (`localStorage`, `IndexedDB`, a
custom SWR `provider`) scoped to the `contact:` key prefix, even in service
of an offline-queueing or "view details later" feature. If a future feature
genuinely needs contact details available offline, that needs its own
explicit, reviewed retention policy — it should not fall out of a generic
persisted-cache change made for an unrelated reason. `lib/contactDetailsCache.ts`
is a small, deliberately narrow module for exactly this reason: change it
in one place, and anyone touching it later has to read this file first.
