import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import type { Player } from '@/types';

jest.mock('@/lib/contract', () => ({
  filterPlayers: jest.fn(),
}));

import { filterPlayers } from '@/lib/contract';
import { useScout } from '@/hooks/useScout';

const mockFilterPlayers = filterPlayers as jest.Mock;

// Fresh, unshared SWR cache per test and no background retries, so
// failures/successes are observable deterministically.
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const PLAYERS: Player[] = [
  {
    id: 'player-1',
    wallet: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
    vitals: {
      name: 'Ava Rodriguez',
      age: 21,
      position: 'Forward',
      region: 'Europe',
      nationality: 'Spain',
    },
    ipfsHash: 'QmHash',
    progressLevel: 1,
    milestones: [],
    createdAt: 0,
  },
];

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useScout — happy path', () => {
  test('search resolves to the filtered player list', async () => {
    mockFilterPlayers.mockResolvedValue(PLAYERS);

    const { result } = renderHook(() => useScout(), { wrapper });

    expect(result.current.players).toEqual([]);

    act(() => {
      result.current.search({ region: 'Europe', position: 'Forward', minLevel: 1 });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFilterPlayers).toHaveBeenCalledWith('Europe', 'Forward', 1);
    expect(result.current.players).toEqual(PLAYERS);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useScout — loading state', () => {
  test('loading is true while the filter call is in-flight', async () => {
    let resolveFilter: (players: Player[]) => void = () => {};
    mockFilterPlayers.mockImplementation(
      () => new Promise((resolve) => { resolveFilter = resolve; }),
    );

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() => {
      result.current.search({ region: '', position: '', minLevel: 0 });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFilter([]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
  });
});

describe('useScout — error state', () => {
  test('error state is set on contract call failure', async () => {
    mockFilterPlayers.mockRejectedValue(new Error('ContractPaused'));

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() => {
      result.current.search({ region: '', position: '', minLevel: 0 });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe('ContractPaused');
    expect(result.current.players).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
