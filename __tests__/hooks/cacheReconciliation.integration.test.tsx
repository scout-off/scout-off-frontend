/**
 * Integration test: live event for player X invalidates X's cached
 * milestone data in a separately-mounted component (proving cross-component
 * reconciliation, not just local component state).
 *
 * Architecture:
 *   - MockPlayerDisplay: a minimal component that reads from useMilestoneHistory
 *     and renders the milestone count.
 *   - CacheReconcilerDriver: a component that holds the event list and feeds
 *     it to useCacheReconciler.
 *
 * Test flow:
 *   1. Mount MockPlayerDisplay — it loads 2 milestones from SWR.
 *   2. Mount CacheReconcilerDriver with an empty event list.
 *   3. Deliver a milestone_approved event for the same player.
 *   4. SWR cache for that player is invalidated — MockPlayerDisplay
 *      re-fetches and shows 3 milestones.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SWRConfig, mutate } from 'swr';
import { useMilestoneHistory, milestonesKey } from '@/hooks/useMilestoneHistory';
import { useCacheReconciler } from '@/hooks/useCacheReconciler';
import type { FeedEvent } from '@/hooks/useContractEvents';
import type { Milestone } from '@/types';

// ── Mock contract calls ───────────────────────────────────────────────────────

const mockFetchMilestones = jest.fn();

jest.mock('@/hooks/useMilestoneHistory', () => {
  const actual = jest.requireActual('@/hooks/useMilestoneHistory');
  return {
    ...actual,
    // Keep the real milestonesKey and invalidateMilestonesCache, override
    // the internal fetch (getMilestoneHistoryFromIndexer).
  };
});

jest.mock('@/lib/indexerClient', () => ({
  getMilestoneHistoryFromIndexer: (...args: unknown[]) =>
    mockFetchMilestones(...args),
}));

// Also mock the contract fallback.
jest.mock('@/lib/contract', () => ({
  getMilestoneHistory: (...args: unknown[]) => mockFetchMilestones(...args),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_ID = 'GPLAYERCROSSCOMP';

const makeMilestone = (id: string): Milestone =>
  ({
    id,
    description: `Milestone ${id}`,
    validator: 'GVALIDATOR',
    approved: true,
    createdAt: new Date().toISOString(),
  }) as unknown as Milestone;

const TWO_MILESTONES = [makeMilestone('m1'), makeMilestone('m2')];
const THREE_MILESTONES = [
  makeMilestone('m1'),
  makeMilestone('m2'),
  makeMilestone('m3'),
];

// ── Components under test ─────────────────────────────────────────────────────

function MockPlayerDisplay({ playerId }: { playerId: string }) {
  const { milestones, isLoading } = useMilestoneHistory(playerId);
  if (isLoading) return <div>loading</div>;
  return <div data-testid="milestone-count">{milestones.length}</div>;
}

function CacheReconcilerDriver({ events }: { events: FeedEvent[] }) {
  useCacheReconciler(events);
  return null;
}

function TestTree({
  events,
  playerId,
}: {
  events: FeedEvent[];
  playerId: string;
}) {
  return (
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MockPlayerDisplay playerId={playerId} />
      <CacheReconcilerDriver events={events} />
    </SWRConfig>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cross-component cache reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Start: 2 milestones.
    mockFetchMilestones.mockResolvedValue(TWO_MILESTONES);
  });

  it('live event for player X updates X\'s cached milestone count in a separately-mounted component', async () => {
    const { rerender } = render(<TestTree events={[]} playerId={PLAYER_ID} />);

    // Wait for initial load.
    await waitFor(() => {
      expect(screen.getByTestId('milestone-count')).toHaveTextContent('2');
    });

    // Now a new milestone is approved — the fetch should return 3.
    mockFetchMilestones.mockResolvedValue(THREE_MILESTONES);

    const liveEvent: FeedEvent = {
      id: 'evt-cross-comp-1',
      type: 'milestone_approved',
      version: 1,
      createdAt: new Date().toISOString(),
      payload: { playerId: PLAYER_ID },
      pagingToken: '999',
    };

    // Deliver the event via the reconciler.
    await act(async () => {
      rerender(
        <TestTree events={[liveEvent]} playerId={PLAYER_ID} />,
      );
      // Allow the reconciler's fire-and-forget invalidation to settle.
      await new Promise((r) => setTimeout(r, 50));
    });

    // The MockPlayerDisplay should have re-fetched and now shows 3.
    await waitFor(() => {
      expect(screen.getByTestId('milestone-count')).toHaveTextContent('3');
    });
  });

  it('event for a different player does NOT trigger a re-fetch for the watched player', async () => {
    const { rerender } = render(<TestTree events={[]} playerId={PLAYER_ID} />);

    await waitFor(() => {
      expect(screen.getByTestId('milestone-count')).toHaveTextContent('2');
    });

    const beforeCallCount = mockFetchMilestones.mock.calls.length;

    const unrelatedEvent: FeedEvent = {
      id: 'evt-other-player',
      type: 'milestone_approved',
      version: 1,
      createdAt: new Date().toISOString(),
      payload: { playerId: 'GDIFFERENTPLAYER' },
      pagingToken: '1000',
    };

    await act(async () => {
      rerender(<TestTree events={[unrelatedEvent]} playerId={PLAYER_ID} />);
      await new Promise((r) => setTimeout(r, 50));
    });

    // No additional fetch should have been triggered for PLAYER_ID.
    expect(mockFetchMilestones.mock.calls.length).toBe(beforeCallCount);
    expect(screen.getByTestId('milestone-count')).toHaveTextContent('2');
  });
});
