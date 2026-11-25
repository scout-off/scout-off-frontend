# Backend Behaviour Notes

Notes on server-side behaviour that spans the frontend API routes and the backend.

## Referral Links (`?ref=CODE`)

The scout referral program passes a referral code between two independent parts of the app via a plain query string — there's no shared constant or type enforcing this contract, so it's easy to break by accident. This section documents the current, verified behavior end to end.

### Where the code is generated

`components/scout/ReferralPanel.tsx` (rendered inside the scout dashboard) lets a scout generate an invite link:

1. On "Generate Invite Link", it calls `generateReferralCode()` (`lib/api.ts`), which `POST`s to `app/api/referrals/generate/route.ts`.
2. The route requires an authenticated `session` cookie and calls `generateCode()` in `lib/referralStore.ts`, which creates a random code in the form `SCOUT-XXXXXX` and persists `{ code, scoutWallet, createdAt, usedBy: null, usedAt: null }` to a JSON-backed store.
3. `ReferralPanel` builds the shareable URL from the returned code:

   ```tsx
   const inviteUrl = `${baseUrl}/scout/subscribe?ref=${ref.code}`;
   ```

   `baseUrl` is derived from `window.location`, and the URL does **not** include a locale segment (e.g. `/en/...`) even though the app is served under `app/[locale]/...`.

### Where the code must be read and redeemed

`app/[locale]/scout/subscribe/page.tsx` is the sole consumer:

1. It reads the param with `useSearchParams().get('ref')` and shows a banner ("You were referred by a colleague! Your referral will be credited automatically when you subscribe.") whenever `ref` is present — this banner does **not** verify the code is real.
2. On successful subscription (`handleSubscribe`), if a `referralCode` was present it fires `redeemReferralCode(referralCode)` (`lib/api.ts`), which `POST`s to `app/api/referrals/redeem/route.ts`. That route calls `redeemCode(code, sessionCookie)` in `lib/referralStore.ts`, which looks up an unused code with a matching string and, if found, marks it `usedBy`/`usedAt`.

If a future contributor changes or removes the subscribe page's `ref` handling, referral codes will still be generated and shared but will never be redeemed — there is no other call site that consumes this param.

### Behavior on an invalid, expired, or malformed code

As implemented today, redemption failures are silent and have no effect on the subscribe flow:

- **Client:** the redeem call is fire-and-forget — `redeemReferralCode(referralCode).catch(() => {})` — so any failure (network error, invalid code, unauthenticated request) is swallowed with no UI feedback or retry.
- **Server:** `redeem/route.ts` does return `404 { error: 'Invalid or already redeemed code' }` when no matching unused code exists, but since the client discards the response body, this is never surfaced to the user.
- **Expiration:** codes never expire — there is no `expiresAt`/TTL field on a referral code and `redeemCode` never checks age.
- **Malformed input:** there is no format validation (e.g. a `SCOUT-` prefix check); any string is sent as-is, gated only by the "does an unused code with this exact string exist" lookup.
- **Self-referral:** `redeemCode` never compares the redeeming session against the code's `scoutWallet`, so nothing currently prevents a scout from redeeming their own generated code.

Net effect: the "You were referred" banner on `/scout/subscribe` renders based purely on the presence of `?ref=`, regardless of whether the code turns out to be valid — a bogus or already-used `ref` value shows the same "will be credited automatically" message as a real one, and the user is never told redemption failed.

---

## IPFS Media CDN Caching and Access Control

Public player profiles (`app/[locale]/player/[id]`) previously rendered `<img>`/`<video>` sources built directly from `NEXT_PUBLIC_IPFS_GATEWAY` — e.g. `https://gateway.pinata.cloud/ipfs/<cid>`. That meant every viewer hit Pinata directly, the raw gateway URL was visible in page HTML for anyone to hotlink or bulk-scrape, and there was no caching layer this platform controlled.

### How it works now

- `lib/mediaUrl.ts` exports `getMediaProxyUrl(cid)`, a client-safe helper that returns `/api/media/<cid>` — a same-origin path — instead of the raw gateway URL. `PlayerCard` and `IPFSMediaGallery` use this instead of reading `NEXT_PUBLIC_IPFS_GATEWAY` directly.
- `app/api/media/[cid]/route.ts` proxies the request server-side (trying `NEXT_PUBLIC_IPFS_GATEWAY` then the same fallback gateways as `lib/ipfs.ts`) and returns the media with `Cache-Control: public, max-age=31536000, immutable` (and the Vercel-specific `CDN-Cache-Control` header). Since IPFS CIDs are content-addressed, this is safe: the same CID always resolves to the same bytes.
- **Cache invalidation**: an updated profile gets a _new_ CID (see `buildUpdateProfile` in `lib/contract.ts`), which is a new proxy URL — there's nothing to invalidate for the old one, since it's still valid (and still immutable) content.
- **Anti-hotlinking / anti-scraping**: the route rejects requests carrying an explicit cross-site `Referer` header (same-origin and "no Referer" requests are allowed, since a legitimate direct navigation or privacy-stripped Referer can't be distinguished from same-site). It also applies a best-effort per-IP rate limit (120 req/min) to blunt bulk scraping.
- **Signed/expiring URLs**: `lib/mediaUrlSigning.ts` (server-only — never import from client code) exposes `signMediaUrl(cid, ttlSeconds)` / `verifyMediaUrlSignature(...)`, gated behind the `MEDIA_URL_SIGNING_SECRET` env var. When a request carries a valid `sig`/`exp` pair the route allows it regardless of Referer — useful for a future flow that needs a non-guessable, time-limited link (e.g. media unlocked via `pay_to_contact`). When the secret isn't set (the local/default case), the route falls back to referrer + rate-limit gating only, so this never blocks contributors who haven't configured it.

### What's intentionally out of scope here

- This is an origin-level (Next.js Route Handler) cache, not a managed CDN config. In production, put a real CDN (Vercel's Edge Network, or Cloudflare in front of the deployment) in front of this route so `Cache-Control`/`CDN-Cache-Control` actually get honored at the edge across regions/instances — the in-process rate limiter here is single-instance and should be replaced by the CDN's own rate limiting (or Upstash/Redis) before relying on it at scale.
- **Bandwidth/cost measurement**: this repo has no production traffic to measure against yet. Once deployed, compare Pinata's bandwidth/request dashboard before and after this change goes live — a meaningful drop in Pinata-side requests for repeatedly-viewed CIDs is the signal this is working; if the CDN in front of `/api/media` isn't caching (e.g. `x-vercel-cache: MISS` on repeat requests), the edge config needs adjusting, not this route.

---
