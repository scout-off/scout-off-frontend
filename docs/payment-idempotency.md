# pay_to_contact / subscribe double-submission protection: design

Design notes for issue #1177 — `lib/contract.ts`'s `payToContact` and
`subscribe` had no idempotency-key mechanism anywhere in the codebase
(`grep -rn idempot lib hooks app/api` returned nothing before this change).
A double-click before a button's disabled state visually registers, or a
retried request from a future `hooks/useOfflineQueue.ts`/
`lib/fetchWithRetry.ts` integration, could each independently result in the
same payment or subscription being submitted twice.

## What layer this protection actually lives at

**Client-side only, in `hooks/useSubmissionGuard.ts`.** This is the honest
answer up front, because it's easy to believe this is more complete than it
is:

- `payToContact` and `subscribe` (`lib/contract.ts`) are direct
  client-to-Soroban-RPC calls (`buildTx` → wallet-sign → `sendTransaction`).
  There is no server-side API proxy in this codebase that either call passes
  through — every other `app/api/**` route in this repo is for IPFS
  uploads, the admin audit log, fraud flags, referral/watchlist/saved-search
  stores, or the activity feed, none of which wrap these two contract
  invocations. So there is no request/response boundary here for a backend
  to deduplicate against.
- **Contract-level idempotency is not verifiable or addable from this repo.**
  This repo does not include the Soroban contract's Rust source (the same
  caveat `docs/admin-audit-log.md` notes for on-chain event shapes) — there
  is no way to confirm whether the deployed contract has any nonce/replay
  protection for `pay_to_contact`/`subscribe`, and no way to add one from
  here if it doesn't. Soroban's account sequence-number mechanics prevent
  _exact XDR replay_, but a second, freshly-built transaction for the same
  logical action is a distinct transaction with its own sequence number and
  is not caught by that.

Given that, the fix implemented here is entirely at the frontend layer:

## `hooks/useSubmissionGuard.ts`

Wraps the entire build-sign-submit attempt (not just the outer click
handler) in:

1. **A synchronous in-flight mutex.** The in-flight check happens on the
   call stack before any `await`, so it doesn't depend on React having
   re-rendered a disabled button yet — a fast double-click (or any other
   re-invocation of `unlock()`/`subscribe()` while one is already pending)
   returns the _same_ in-flight promise instead of starting a second
   `payToContact`/`subscribe` call. This is real, verified protection — see
   the "double-click" tests below — for the specific failure mode named in
   the issue (a click registering before the button visually disables).
2. **A client-generated idempotency key** (`lib/idempotency.ts`,
   `crypto.randomUUID()`) created fresh per new attempt and passed into the
   wrapped action, so it's available to include in any future request/log
   metadata.
3. **A short-lived cache of the last _successful_ result**, keyed by that
   idempotency key. A call that passes the _same explicit key_ as an
   already-completed call short-circuits to the cached result instead of
   re-running the action. A failed attempt is never cached, so retrying
   with the same key after a failure genuinely retries. This is what would
   let a future `useOfflineQueue`/`fetchWithRetry` integration replay a
   request without resubmitting — but as of this change, neither hook wires
   an explicit key back in on retry, because neither `usePayToContact` nor
   `useSubscription` currently has a retry path that would carry one. Every
   _new_ user-initiated click still gets a fresh key and a fresh attempt, as
   it should.

Applied to both `hooks/usePayToContact.ts`'s `unlock()` and
`hooks/useSubscription.ts`'s `subscribe()`.

## What this explicitly does NOT cover

- **No contract-level guarantee.** If the deployed contract itself has no
  replay/dedup protection, two _independent browser tabs_ (or two
  independent page loads — different `useSubmissionGuard` instances, since
  the mutex is per-hook-instance, not global/cross-tab) could still each
  submit a genuine, valid transaction for the same logical action. This fix
  only prevents _one browser tab's one hook instance_ from submitting twice.
- **No server-side dedup**, because no server sits between the browser and
  Soroban RPC for these two calls today. If that boundary is ever
  introduced (per the notes accompanying this issue, contingent on
  `lib/fetchWithRetry.ts` adoption being standardized first — tracked
  separately), the idempotency key this hook already generates is available
  to pass through to it.
- **No cross-session persistence.** The in-flight mutex and the completed-
  result cache both live in a React `useRef` — they reset on page reload.
  This is consistent with `usePayToContact`'s existing non-persistence
  policy for contact details (see `docs/contact-details-privacy.md`) but is
  worth stating plainly: this is a same-page-session guarantee, not a
  durable one.

## Test plan

- `__tests__/hooks/useSubmissionGuard.test.ts` — the mechanism itself:
  a rapid double-submission invokes the action once; an explicit-key retry
  after success short-circuits without re-invoking; a failed attempt is not
  cached and a same-key retry after failure genuinely retries; calls with
  no explicit key (the normal UI path) are independent new attempts.
- `__tests__/hooks/usePayToContact.test.ts` and
  `__tests__/hooks/useSubscription.test.ts` each gained a test simulating a
  rapid double-click on `unlock()`/`subscribe()` and asserting the
  underlying `payToContact`/`subscribe` contract call was made exactly
  once.
