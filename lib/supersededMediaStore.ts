/**
 * Server-side store tracking IPFS CIDs that have been superseded by a newer
 * upload and are candidates for unpinning.
 *
 * In-memory (single-process) — the same deployment assumption
 * lib/chunkedUploadStore.ts used to make before issue #1175 moved it to
 * shared storage. In a multi-instance deployment, this store would need the
 * same fix: Redis (lib/rateLimit.ts's pattern) for the small candidate
 * records, no SQLite/blob storage needed since there are no large payloads
 * here.
 *
 * Grace period: CDN cache TTL is 1 year (immutable, max-age=31536000 in
 * app/api/media/[cid]/route.ts). However, unpinning after a full year would
 * be excessive — the CDN edge cache only serves existing cached copies; once
 * a CDN edge evicts its copy (typically 7–30 days depending on CDN config
 * and cache pressure), a cache-miss for the old CID will fail if it's been
 * unpinned. We choose 72 hours (3 days) as the grace period:
 *   - Long enough for any in-flight CDN edge copies to be re-fetched and cached
 *     from the origin before unpinning.
 *   - Long enough for a client that loaded the old profile just before the update
 *     to complete any ongoing media load.
 *   - Short enough to provide meaningful storage reclamation without waiting days/weeks.
 * This is documented here so it can be tuned if CDN behavior changes.
 */

import crypto from 'crypto';

export const UNPIN_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours

export interface SupersededCidRecord {
  id: string;
  cid: string;
  playerId: string;
  supersededAt: number; // Unix ms
  unpinnedAt: number | null; // Unix ms, or null if not yet unpinned
}

const records = new Map<string, SupersededCidRecord>();

/** Records a CID as superseded. Returns the created record. */
export function recordSupersededCid(
  cid: string,
  playerId: string,
): SupersededCidRecord {
  const id = crypto.randomUUID();
  const record: SupersededCidRecord = {
    id,
    cid,
    playerId,
    supersededAt: Date.now(),
    unpinnedAt: null,
  };
  records.set(id, record);
  return record;
}

/** Returns all records eligible for unpinning (past grace period, not yet unpinned). */
export function getEligibleForUnpin(): SupersededCidRecord[] {
  const now = Date.now();
  return Array.from(records.values()).filter(
    (r) =>
      r.unpinnedAt === null && now - r.supersededAt >= UNPIN_GRACE_PERIOD_MS,
  );
}

/** Returns all records (for inspection/audit). */
export function getAllRecords(): SupersededCidRecord[] {
  return Array.from(records.values());
}

/** Marks a record as unpinned. */
export function markUnpinned(id: string): void {
  const record = records.get(id);
  if (record) record.unpinnedAt = Date.now();
}

/** Checks whether a CID is still the current reference for any player.
 * Pass the currentCidsByPlayer map (playerId -> currentCid) to verify.
 * Returns true if the CID is still referenced (should not be unpinned). */
export function isCidStillReferenced(
  cid: string,
  currentCidsByPlayer: Map<string, string>,
): boolean {
  for (const currentCid of currentCidsByPlayer.values()) {
    if (currentCid === cid) return true;
  }
  return false;
}

/** Test-only reset. */
export function __resetForTests(): void {
  records.clear();
}
