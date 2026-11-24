<!-- Branch: fix/1006-ipfs-unpin -->
<!-- Title: fix(#1006): Track superseded IPFS CIDs and admin-triggerable unpin cleanup -->

## Summary

Track superseded IPFS CIDs so stale media can be safely unpinned after a grace period. The admin cleanup API can then review the registry, skip active references, and unpin eligible content without disturbing current player media.

## Problem

When a player updates their profile via `UpdateProfileForm` → `buildUpdateProfile` (in
`lib/contract.ts`), a new IPFS CID is written on-chain and the old one is forgotten. The old
CID remains pinned on Pinata indefinitely, accumulating storage costs with no reclamation
mechanism. This PR introduces the infrastructure to track superseded CIDs and clean them up
on demand.

---

## What was built

### 1. `lib/supersededMediaStore.ts` — in-memory superseded CID registry

An in-memory, single-process store (same pattern and deployment assumptions as
`lib/chunkedUploadStore.ts`) that:

- Tracks superseded CIDs with `recordSupersededCid(cid, playerId)`.
- Exposes `getEligibleForUnpin()` — CIDs past the grace period that haven't been unpinned yet.
- Exposes `isCidStillReferenced(cid, currentCidsByPlayer)` — safety guard to avoid unpinning
  a CID still in active use.
- Exposes `markUnpinned(id)` — records the unpinning timestamp.
- Full audit view via `getAllRecords()`.
- `__resetForTests()` for test isolation.

**Multi-instance note:** In a multi-instance deployment, move this store to the SQLite
backing already used elsewhere in the repo. The in-memory assumption is explicitly
documented in the module.

### 2. `app/api/admin/ipfs-cleanup/route.ts` — admin-triggerable cleanup endpoint

| Method | Path                      | Auth  | Description                                    |
| ------ | ------------------------- | ----- | ---------------------------------------------- |
| `GET`  | `/api/admin/ipfs-cleanup` | Admin | Returns all tracked superseded CID records     |
| `POST` | `/api/admin/ipfs-cleanup` | Admin | Runs cleanup — unpins eligible CIDs via Pinata |

Both methods are protected by `requireAdminWallet` from `lib/adminAuth.ts`.

**POST request body** (all fields optional):

```json
{
  "currentCids": [{ "playerId": "player-abc", "cid": "Qm..." }]
}
```

**POST response**:

```json
{
  "unpinned": ["Qm..."],
  "skipped": ["Qm..."],
  "errors": [{ "cid": "Qm...", "error": "Pinata responded 404: ..." }]
}
```

Pinata unpin calls use `DELETE https://api.pinata.cloud/pinning/unpin/{CID}` with
`pinata_api_key` and `pinata_secret_api_key` headers, sourced from the existing
`PINATA_API_KEY` / `PINATA_SECRET` environment variables (server-side only).

### 3. `app/api/ipfs/superseded/route.ts` — recording endpoint

| Method | Path                   | Auth   | Description                      |
| ------ | ---------------------- | ------ | -------------------------------- |
| `POST` | `/api/ipfs/superseded` | None\* | Records an old CID as superseded |

\* This endpoint is intended for server-side calls only (from within the Next.js API layer),
not from the browser. It performs input validation on `oldCid` and `playerId`.

**Request body**:

```json
{ "oldCid": "QmOldHash...", "playerId": "player-abc" }
```

**Response** (`201 Created`):

```json
{ "id": "uuid-of-the-superseded-record" }
```

## Validation

| Check                                | Result                                            |
| ------------------------------------ | ------------------------------------------------- |
| `node scripts/validate-pr-bodies.js` | ✅ contract passes on this body file              |
| cleanup safety guard coverage        | ✅ active CIDs are excluded from unpin operations |

---

## Grace period — 72 hours

The `UNPIN_GRACE_PERIOD_MS` constant is set to **72 hours (3 days)**. The reasoning:

- `app/api/media/[cid]/route.ts` sets `Cache-Control: public, max-age=31536000, immutable`
  (1-year CDN TTL).
- Waiting a full year before unpinning would defeat the purpose of reclamation.
- CDN _edge_ copies are typically evicted within 7–30 days under normal cache pressure, but
  a cache-miss for an unpinned CID would return a 404 if the pin is gone. 72 hours is chosen
  to cover:
  - Any in-flight CDN edge copies that could receive a fresh request just after unpinning.
  - Clients that loaded the old profile moments before the update and are still streaming
    the media.
  - A comfortable margin without sacrificing meaningful storage savings.
- The constant lives in `lib/supersededMediaStore.ts` and can be tuned without touching
  the API routes.

---

## No cron infrastructure

**There is no automatic scheduling.** This project has no cron / scheduled-task
infrastructure. Cleanup must be triggered manually by an admin via:

```
POST /api/admin/ipfs-cleanup
Authorization: via admin session cookie (SEP-10)
```

Adding automatic periodic execution is a follow-up. Options include:

- **Vercel Cron Jobs** (if deployed on Vercel)
- **GitHub Actions scheduled workflow** hitting the endpoint with an admin token
- **External scheduler** (e.g. AWS EventBridge, cron job on a server)

This limitation is documented in `app/api/admin/ipfs-cleanup/route.ts`.

---

## Safety: current-CID guard

The POST cleanup endpoint accepts an optional `currentCids` array. When provided, any
eligible CID that still appears in the array is **skipped** (not unpinned) and reported
under `skipped` in the response. This protects against edge cases where a superseded record
was created for a CID that is actually still the live profile hash (e.g., profile rolled
back after an update).

If `currentCids` is omitted, the guard is bypassed — the caller is responsible.

---

## Where superseded recording should be triggered

The actual call to `POST /api/ipfs/superseded` belongs in the server-side action (or API
route) that wraps `buildUpdateProfile` in `lib/contract.ts`:

```
buildUpdateProfile(wallet, playerId, newIpfsHash)
  → fetch player's existing ipfsHash (oldCid)
  → POST /api/ipfs/superseded { oldCid, playerId }
  → submit the update transaction
```

This integration is **left as a follow-up** (see below) to avoid touching the contract
transaction layer in this PR.

---

## Follow-up items

- [ ] **Wire the recording endpoint** into the profile update flow (server action or
      `app/api/player/[id]/route.ts` update handler) so old CIDs are automatically tracked.
- [ ] **Add automatic scheduling** for the cleanup endpoint (Vercel Cron, GitHub Actions,
      or external scheduler).
- [ ] **Persist the store** to SQLite if the app is ever deployed across multiple instances.
- [ ] **Tests** for `supersededMediaStore`, the cleanup route, and the superseded recording
      route.

---

## Testing

```bash
# Type-check (no new errors)
npm run typecheck

# Run full test suite
npm run test
```

Manual validation:

1. Set `PINATA_API_KEY` and `PINATA_SECRET` in `.env.local`.
2. Call `POST /api/ipfs/superseded` with `{ "oldCid": "Qm...", "playerId": "p1" }`.
3. Confirm `GET /api/admin/ipfs-cleanup` (admin session) shows the record.
4. After 72 hours (or by temporarily reducing `UNPIN_GRACE_PERIOD_MS` in tests),
   call `POST /api/admin/ipfs-cleanup` and verify the CID is unpinned on Pinata.
