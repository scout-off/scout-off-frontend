import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useValidatorActionLog } from '@/hooks/useValidatorActionLog';
import { fetchEvents, type IndexedEvent } from '@/lib/indexerClient';

jest.mock('@/lib/indexerClient', () => ({ fetchEvents: jest.fn() }));

const mockFetchEvents = fetchEvents as jest.MockedFunction<typeof fetchEvents>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

function event(
  id: number,
  type: 'milestone_approved' | 'milestone_revoked',
  timestamp: number,
  validator: string | null,
  milestoneId?: unknown,
): IndexedEvent {
  return {
    id,
    type,
    timestamp,
    validator,
    playerId: `p${id}`,
    data: milestoneId === undefined ? {} : { milestone_id: milestoneId },
  } as unknown as IndexedEvent;
}

const APPROVED = [
  event(1, 'milestone_approved', 100, 'GVAL_B', 'm1'),
  event(2, 'milestone_approved', 300, 'GVAL_A', 7),
];
const REVOKED = [event(3, 'milestone_revoked', 200, null)];

function mockPages(pages: Record<string, IndexedEvent[][]>) {
  mockFetchEvents.mockImplementation(async ({ type, before }) => {
    const list = pages[type as string] ?? [[]];
    const index = before === undefined ? 0 : before;
    return {
      events: list[index] ?? [],
      nextCursor: index + 1 < list.length ? index + 1 : null,
    } as Awaited<ReturnType<typeof fetchEvents>>;
  });
}

beforeEach(() => mockFetchEvents.mockReset());

describe('useValidatorActionLog', () => {
  it('merges approvals and revocations newest-first across pages', async () => {
    mockPages({
      milestone_approved: [[APPROVED[0]], [APPROVED[1]]],
      milestone_revoked: [REVOKED],
    });

    const { result } = renderHook(() => useValidatorActionLog(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    expect(result.current.entries).toEqual([
      {
        id: 'milestone_approved-2',
        timestamp: 300,
        validator: 'GVAL_A',
        playerId: 'p2',
        // Non-string milestone ids are dropped rather than coerced.
        milestoneId: null,
        action: 'approved',
      },
      {
        id: 'milestone_revoked-3',
        timestamp: 200,
        validator: null,
        playerId: 'p3',
        milestoneId: null,
        action: 'revoked',
      },
      {
        id: 'milestone_approved-1',
        timestamp: 100,
        validator: 'GVAL_B',
        playerId: 'p1',
        milestoneId: 'm1',
        action: 'approved',
      },
    ]);
    expect(result.current.validators).toEqual(['GVAL_A', 'GVAL_B']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('filters by time range and validator', async () => {
    mockPages({
      milestone_approved: [APPROVED],
      milestone_revoked: [REVOKED],
    });
    const { result } = renderHook(() => useValidatorActionLog(), { wrapper });
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    act(() => result.current.setFilter({ from: 150, to: 250 }));
    expect(result.current.entries.map((e) => e.timestamp)).toEqual([200]);

    act(() => result.current.setFilter({ validator: 'GVAL_B' }));
    expect(result.current.entries.map((e) => e.id)).toEqual([
      'milestone_approved-1',
    ]);
  });

  it('exposes fetch errors and refetches on demand', async () => {
    mockFetchEvents.mockRejectedValue(new Error('indexer down'));
    const { result } = renderHook(() => useValidatorActionLog(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('indexer down'));
    expect(result.current.entries).toEqual([]);

    mockPages({ milestone_approved: [APPROVED], milestone_revoked: [[]] });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
  });
});
