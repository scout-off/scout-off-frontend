import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useComparePlayers } from '@/hooks/useComparePlayers';
import { getPlayer } from '@/lib/contract';

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

const mockFetchPlayerById = getPlayer as jest.Mock;

/** Fresh SWR cache per test so results never leak between cases. */
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe('useComparePlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches multiple players by ID for comparison', async () => {
    mockFetchPlayerById.mockImplementation(async (id: string) => ({
      id,
      name: `Player ${id}`,
    }));

    const { result } = renderHook(() => useComparePlayers(['1', '2', '3']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.players).toHaveLength(3));

    expect(mockFetchPlayerById).toHaveBeenCalledTimes(3);
    expect(mockFetchPlayerById).toHaveBeenCalledWith('1');
    expect(mockFetchPlayerById).toHaveBeenCalledWith('2');
    expect(mockFetchPlayerById).toHaveBeenCalledWith('3');
    expect(result.current.players).toEqual([
      { id: '1', name: 'Player 1' },
      { id: '2', name: 'Player 2' },
      { id: '3', name: 'Player 3' },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('exposes a loading state while all players are being fetched', () => {
    mockFetchPlayerById.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useComparePlayers(['1', '2']), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.players).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns the other players without an error when one ID is not found', async () => {
    mockFetchPlayerById.mockImplementation(async (id: string) => {
      if (id === '2') {
        throw new Error('Player not found');
      }
      return { id, name: `Player ${id}` };
    });

    const { result } = renderHook(() => useComparePlayers(['1', '2', '3']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.players).toHaveLength(2));

    expect(result.current.players).toEqual([
      { id: '1', name: 'Player 1' },
      { id: '3', name: 'Player 3' },
    ]);
    // Lookups are settled individually, so one missing player is dropped
    // rather than failing the whole comparison.
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns an empty result set without a network call for an empty ID list', async () => {
    const { result } = renderHook(() => useComparePlayers([]), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchPlayerById).not.toHaveBeenCalled();
    expect(result.current.players).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
