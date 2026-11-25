'use client';

/**
 * useCacheReconciler
 *
 * Bridges the live contract event stream (useContractEvents) with the SWR
 * cache (useMilestoneHistory / usePlayer).  Any event that affects a player's
 * milestone state triggers an invalidation of exactly the SWR keys that need
 * refreshing, without a full-page reload.
 *
 * Idempotency / ordering guarantees:
 *   - Events are deduplicated by id before invalidation (seenRef).
 *   - Ordering is tracked via Horizon's paging_token (the monotonic ledger
 *     sequence number for each operation).  An event whose pagingToken is
 *     numerically ≤ the last-seen token for the same player is a stale
 *     replay and is discarded rather than invalidated — this prevents a
 *     revoked milestone from regressing back to approved on reconnect replay.
 *   - `invalidateMilestonesCache` / `invalidatePlayerCache` both call
 *     `globalMutate` which is itself idempotent — calling it twice for the
 *     same key within SWR's dedupingInterval produces only one network round-
 *     trip, so double-delivery causes no flicker or double-decrement.
 *
 * Usage:
 *   Mount once near the root of the authenticated app tree (e.g. in a layout
 *   component).  It has no visible output — it is a side-effect-only hook.
 */

import { useEffect, useRef } from 'react';
import { invalidateMilestonesCache } from '@/hooks/useMilestoneHistory';
import { invalidatePlayerCache } from '@/hooks/usePlayer';
import type { FeedEvent } from '@/hooks/useContractEvents';

/** Event types whose payloads reference a playerId that needs cache invalidation. */
const PLAYER_AFFECTING_EVENTS = new Set([
  'player_registered',
  'profile_updated',
  'milestone_approved',
  'milestone_revoked',
  'player_contacted',
  'trial_offer_logged',
]);

/**
 * Extract the player ID from a FeedEvent payload.
 * The payload uses `playerId` (from Horizon operation parameters) or the
 * on-chain account address stored as `player`.
 */
export function extractPlayerId(event: FeedEvent): string | null {
  const p = event.payload ?? {};
  const id =
    (p.playerId as string | undefined) ??
    (p.player_id as string | undefined) ??
    (p.player as string | undefined) ??
    null;
  return id && typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Compare two Horizon paging tokens (zero-padded numeric strings, e.g.
 * "179539373969612800").  Returns true when `a` is strictly newer than `b`
 * (i.e., a > b numerically).
 *
 * BigInt is used because paging tokens can exceed Number.MAX_SAFE_INTEGER.
 */
export function isNewerToken(a: string, b: string): boolean {
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    // Non-numeric tokens (e.g. 'now') — treat as newer to be safe.
    return true;
  }
}

/**
 * Imperatively invalidate the SWR caches for a player after a confirmed
 * local write (ApproveForm, RevokeForm, etc.).
 *
 * Both milestones and player top-level data are invalidated so ProgressBar
 * and PlayerCard both re-fetch.
 */
export async function reconcilePlayerCache(playerId: string): Promise<void> {
  await Promise.all([
    invalidateMilestonesCache(playerId),
    invalidatePlayerCache(playerId),
  ]);
}

/**
 * React hook — mount once; fires cache invalidations when the live event
 * stream delivers milestone-affecting events for any player.
 *
 * @param events The live FeedEvent array from useContractEvents.
 */
export function useCacheReconciler(events: FeedEvent[]): void {
  // Tracks event ids we have already processed to prevent double-invalidation
  // on reconnect replay.
  const processedRef = useRef<Set<string>>(new Set());

  // Tracks the last paging_token seen per player to prevent out-of-order
  // stale events (e.g. a replayed milestone_approved arriving after the
  // milestone_revoked that supersedes it) from triggering a spurious refetch
  // that could momentarily show stale data.
  const lastTokenRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (events.length === 0) return;

    for (const event of events) {
      // Skip events we've already processed (duplicate delivery).
      if (processedRef.current.has(event.id)) continue;

      // Skip events that don't affect player milestone state.
      if (!PLAYER_AFFECTING_EVENTS.has(event.type)) {
        processedRef.current.add(event.id);
        continue;
      }

      const playerId = extractPlayerId(event);
      if (!playerId) {
        processedRef.current.add(event.id);
        continue;
      }

      // Order check: if this event's paging_token is older than or equal to
      // the last token we processed for this player, it is a stale replay and
      // must not trigger an invalidation that could regress state.
      const eventToken = event.pagingToken ?? '';
      const lastToken = lastTokenRef.current.get(playerId) ?? '';
      if (eventToken && lastToken && !isNewerToken(eventToken, lastToken)) {
        processedRef.current.add(event.id);
        continue;
      }

      // Mark as processed before the async invalidation to avoid a second
      // tick delivering the same event again during the await.
      processedRef.current.add(event.id);
      if (eventToken) {
        lastTokenRef.current.set(playerId, eventToken);
      }

      // Fire-and-forget: cache invalidation failures are non-fatal — SWR
      // will re-validate on the next focus or interval anyway.
      reconcilePlayerCache(playerId).catch(() => {});
    }
  }, [events]);
}
