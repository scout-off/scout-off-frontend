/**
 * Tests for useCacheReconciler, reconcilePlayerCache, extractPlayerId,
 * and isNewerToken.
 *
 * These tests verify:
 *   1. Cross-component cache invalidation: a live event for player X
 *      invalidates X's SWR cache (milestones + player).
 *   2. Out-of-order safety: a stale replayed event that arrives after a
 *      later event for the same player is silently dropped.
 *   3. Duplicate-delivery idempotency: the same event id delivered twice
 *      does not trigger a second invalidation.
 *   4. extractPlayerId correctly extracts from all payload field variants.
 *   5. isNewerToken correctly orders Horizon paging tokens.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  useCacheReconciler,
  reconcilePlayerCache,
  extractPlayerId,
  isNewerToken,
} from '@/hooks/useCacheReconciler';
import type { FeedEvent } from '@/hooks/useContractEvents';

// ── Mock the cache invalidation functions ─────────────────────────────────────

const mockInvalidateMilestones = jest.fn().mockResolvedValue(undefined);
const mockInvalidatePlayer = jest.fn().mockResolvedValue(undefined);

jest.mock('@/hooks/useMilestoneHistory', () => ({
  invalidateMilestonesCache: (...args: unknown[]) =>
    mockInvalidateMilestones(...args),
  milestonesKey: (id: string | null) => (id ? `milestones:${id}` : null),
}));

jest.mock('@/hooks/usePlayer', () => ({
  invalidatePlayerCache: (...args: unknown[]) => mockInvalidatePlayer(...args),
  playerKey: (id: string | null) => (id ? `player:${id}` : null),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Partial<FeedEvent> & { id: string; type: FeedEvent['type'] },
): FeedEvent {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

// ── extractPlayerId ───────────────────────────────────────────────────────────

describe('extractPlayerId', () => {
  it('extracts from playerId field', () => {
    const ev = makeEvent({
      id: 'e1',
      type: 'milestone_approved',
      payload: { playerId: 'GPLAYER1' },
    });
    expect(extractPlayerId(ev)).toBe('GPLAYER1');
  });

  it('falls back to player_id field', () => {
    const ev = makeEvent({
      id: 'e2',
      type: 'milestone_approved',
      payload: { player_id: 'GPLAYER2' },
    });
    expect(extractPlayerId(ev)).toBe('GPLAYER2');
  });

  it('falls back to player field', () => {
    const ev = makeEvent({
      id: 'e3',
      type: 'milestone_approved',
      payload: { player: 'GPLAYER3' },
    });
    expect(extractPlayerId(ev)).toBe('GPLAYER3');
  });

  it('returns null when no player identifier is present', () => {
    const ev = makeEvent({ id: 'e4', type: 'fees_withdrawn', payload: {} });
    expect(extractPlayerId(ev)).toBeNull();
  });

  it('returns null for empty string payloads', () => {
    const ev = makeEvent({
      id: 'e5',
      type: 'milestone_approved',
      payload: { playerId: '' },
    });
    expect(extractPlayerId(ev)).toBeNull();
  });
});

// ── isNewerToken ──────────────────────────────────────────────────────────────

describe('isNewerToken', () => {
  it('returns true when a is numerically greater than b', () => {
    expect(isNewerToken('179539373969612801', '179539373969612800')).toBe(true);
  });

  it('returns false when a equals b', () => {
    expect(isNewerToken('179539373969612800', '179539373969612800')).toBe(
      false,
    );
  });

  it('returns false when a is less than b', () => {
    expect(isNewerToken('179539373969612799', '179539373969612800')).toBe(
      false,
    );
  });

  it('handles very large token values beyond Number.MAX_SAFE_INTEGER', () => {
    const big = '99999999999999999999';
    const small = '99999999999999999998';
    expect(isNewerToken(big, small)).toBe(true);
    expect(isNewerToken(small, big)).toBe(false);
  });

  it('treats non-numeric tokens as newer (safe default)', () => {
    expect(isNewerToken('now', '179539373969612800')).toBe(true);
  });
});

// ── reconcilePlayerCache ──────────────────────────────────────────────────────

describe('reconcilePlayerCache', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls both invalidateMilestonesCache and invalidatePlayerCache for the same id', async () => {
    await reconcilePlayerCache('GTEST');
    expect(mockInvalidateMilestones).toHaveBeenCalledWith('GTEST');
    expect(mockInvalidatePlayer).toHaveBeenCalledWith('GTEST');
  });
});

// ── useCacheReconciler ────────────────────────────────────────────────────────

describe('useCacheReconciler', () => {
  beforeEach(() => jest.clearAllMocks());

  // Helper: render the hook with a given events array and flush microtasks.
  async function renderReconciler(events: FeedEvent[]) {
    const { rerender } = renderHook(
      ({ evs }: { evs: FeedEvent[] }) => useCacheReconciler(evs),
      { initialProps: { evs: events } },
    );
    // Flush all promises (reconcilePlayerCache is fire-and-forget).
    await act(async () => {
      await Promise.resolve();
    });
    return rerender;
  }

  it('invalidates the correct player cache when a milestone_approved event arrives', async () => {
    const events: FeedEvent[] = [
      makeEvent({
        id: 'evt-approve-1',
        type: 'milestone_approved',
        payload: { playerId: 'GPLAYERABC' },
        pagingToken: '100',
      }),
    ];

    await renderReconciler(events);

    expect(mockInvalidateMilestones).toHaveBeenCalledWith('GPLAYERABC');
    expect(mockInvalidatePlayer).toHaveBeenCalledWith('GPLAYERABC');
  });

  it('invalidates the correct player cache when a milestone_revoked event arrives', async () => {
    const events: FeedEvent[] = [
      makeEvent({
        id: 'evt-revoke-1',
        type: 'milestone_revoked',
        payload: { playerId: 'GPLAYERXYZ' },
        pagingToken: '200',
      }),
    ];

    await renderReconciler(events);

    expect(mockInvalidateMilestones).toHaveBeenCalledWith('GPLAYERXYZ');
    expect(mockInvalidatePlayer).toHaveBeenCalledWith('GPLAYERXYZ');
  });

  it('does NOT invalidate cache for non-player-affecting events (fees_withdrawn)', async () => {
    const events: FeedEvent[] = [
      makeEvent({
        id: 'evt-fees-1',
        type: 'fees_withdrawn',
        payload: { amount: '100' },
        pagingToken: '300',
      }),
    ];

    await renderReconciler(events);

    expect(mockInvalidateMilestones).not.toHaveBeenCalled();
    expect(mockInvalidatePlayer).not.toHaveBeenCalled();
  });

  it('does NOT invalidate when event has no recognizable player identifier', async () => {
    const events: FeedEvent[] = [
      makeEvent({
        id: 'evt-noplayer-1',
        type: 'milestone_approved',
        payload: { someOtherField: 'value' },
        pagingToken: '400',
      }),
    ];

    await renderReconciler(events);

    expect(mockInvalidateMilestones).not.toHaveBeenCalled();
    expect(mockInvalidatePlayer).not.toHaveBeenCalled();
  });

  // ── Duplicate-delivery idempotency ───────────────────────────────────────

  it('processes each unique event id exactly once across multiple renders (duplicate delivery)', async () => {
    const event = makeEvent({
      id: 'evt-dup-1',
      type: 'milestone_approved',
      payload: { playerId: 'GPLAYERDUP' },
      pagingToken: '500',
    });

    const rerender = await renderReconciler([event]);

    // Deliver the same event id again (simulating SSE reconnect replay).
    await act(async () => {
      rerender({ evs: [event, event] });
      await Promise.resolve();
    });

    // Should have invalidated exactly once despite two deliveries.
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(1);
    expect(mockInvalidatePlayer).toHaveBeenCalledTimes(1);
  });

  // ── Out-of-order ordering safety ─────────────────────────────────────────

  it('discards a stale replayed milestone_approved that arrives after a newer milestone_revoked for the same player', async () => {
    const revokeEvent = makeEvent({
      id: 'evt-revoke-ordered',
      type: 'milestone_revoked',
      payload: { playerId: 'GPLAYERORDERED' },
      pagingToken: '1000',
    });

    const staleApproveEvent = makeEvent({
      id: 'evt-approve-stale',
      type: 'milestone_approved',
      payload: { playerId: 'GPLAYERORDERED' },
      pagingToken: '999', // older token — this is the stale replay
    });

    // First deliver the revoke (the newer event).
    const rerender = await renderReconciler([revokeEvent]);
    jest.clearAllMocks();

    // Now deliver the stale approve — should be dropped.
    await act(async () => {
      rerender({ evs: [revokeEvent, staleApproveEvent] });
      await Promise.resolve();
    });

    // The stale approve must NOT trigger a second invalidation.
    expect(mockInvalidateMilestones).not.toHaveBeenCalled();
    expect(mockInvalidatePlayer).not.toHaveBeenCalled();
  });

  it('processes events in arrival order when pagingToken correctly identifies a newer event', async () => {
    // approve at t=100, revoke at t=200 — both are genuinely new and should
    // each trigger an invalidation (the cache refetch converges to revoked).
    const events: FeedEvent[] = [
      makeEvent({
        id: 'evt-approve-ordered',
        type: 'milestone_approved',
        payload: { playerId: 'GPLAYERSEQ' },
        pagingToken: '100',
      }),
      makeEvent({
        id: 'evt-revoke-ordered-2',
        type: 'milestone_revoked',
        payload: { playerId: 'GPLAYERSEQ' },
        pagingToken: '200',
      }),
    ];

    await renderReconciler(events);

    // Both events are newer than nothing — both should invalidate.
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(2);
    expect(mockInvalidatePlayer).toHaveBeenCalledTimes(2);
    expect(mockInvalidateMilestones).toHaveBeenCalledWith('GPLAYERSEQ');
  });

  // ── Cross-player isolation ────────────────────────────────────────────────

  it('invalidates only the affected player cache, not other players', async () => {
    const events: FeedEvent[] = [
      makeEvent({
        id: 'evt-player-a',
        type: 'milestone_approved',
        payload: { playerId: 'GPLAYERA' },
        pagingToken: '100',
      }),
    ];

    await renderReconciler(events);

    expect(mockInvalidateMilestones).toHaveBeenCalledWith('GPLAYERA');
    expect(mockInvalidateMilestones).not.toHaveBeenCalledWith('GPLAYERB');
  });
});

// ── End-to-end simulation harness ────────────────────────────────────────────
// Simulates out-of-order and dropped events via a controlled event queue,
// verifying that the reconciler's final state matches ledger truth.

describe('useCacheReconciler — event simulation harness', () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * Simulate an event stream where events arrive out of order.
   *
   * Scenario:
   *   1. milestone_approved at token 300  → player cache invalidated
   *   2. milestone_revoked  at token 400  → player cache invalidated again
   *   3. stale milestone_approved at token 290 arrives (replay) → DROPPED
   *
   * The final state: invalidated twice (once per genuine event), not three
   * times, and no regression to approved after the revoke.
   */
  it('harness: out-of-order replay converges to ledger truth', async () => {
    const approveEvent = makeEvent({
      id: 'harness-approve-1',
      type: 'milestone_approved',
      payload: { playerId: 'GHARNESS1' },
      pagingToken: '300',
    });

    const revokeEvent = makeEvent({
      id: 'harness-revoke-1',
      type: 'milestone_revoked',
      payload: { playerId: 'GHARNESS1' },
      pagingToken: '400',
    });

    const staleReplayEvent = makeEvent({
      id: 'harness-stale-approve',
      type: 'milestone_approved',
      payload: { playerId: 'GHARNESS1' },
      pagingToken: '290', // older than both — a true stale replay
    });

    const { rerender } = renderHook(
      ({ evs }: { evs: FeedEvent[] }) => useCacheReconciler(evs),
      { initialProps: { evs: [] } },
    );

    // Step 1: approve arrives
    await act(async () => {
      rerender({ evs: [approveEvent] });
      await Promise.resolve();
    });
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(1);

    // Step 2: revoke arrives (newer token)
    await act(async () => {
      rerender({ evs: [approveEvent, revokeEvent] });
      await Promise.resolve();
    });
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(2);

    // Step 3: stale replay arrives — must NOT trigger another invalidation.
    await act(async () => {
      rerender({ evs: [approveEvent, revokeEvent, staleReplayEvent] });
      await Promise.resolve();
    });
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(2);
    expect(mockInvalidatePlayer).toHaveBeenCalledTimes(2);
  });

  it('harness: dropped-then-redelivered event is processed only once', async () => {
    const ev = makeEvent({
      id: 'harness-dropped',
      type: 'milestone_revoked',
      payload: { playerId: 'GHARNESS2' },
      pagingToken: '500',
    });

    const { rerender } = renderHook(
      ({ evs }: { evs: FeedEvent[] }) => useCacheReconciler(evs),
      { initialProps: { evs: [] } },
    );

    // Initial delivery.
    await act(async () => {
      rerender({ evs: [ev] });
      await Promise.resolve();
    });
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(1);

    // Redelivery on reconnect — same id.
    await act(async () => {
      rerender({ evs: [ev] });
      await Promise.resolve();
    });
    expect(mockInvalidateMilestones).toHaveBeenCalledTimes(1);
  });
});
