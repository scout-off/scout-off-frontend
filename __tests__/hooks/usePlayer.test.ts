import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import type { Player } from '@/types';

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

import { getPlayer } from '@/lib/contract';
import { usePlayer } from '@/hooks/usePlayer';

const mockGetPlayer = getPlayer as jest.Mock;

// Fresh, unshared SWR cache per test and no background retries, so
// failures/successes are observable deterministically.
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const PLAYER: Player = {
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
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('usePlayer — happy path', () => {
  test('player found returns the Player object', async () => {
    mockGetPlayer.mockResolvedValue(PLAYER);

    const { result } = renderHook(() => usePlayer('player-1'), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetPlayer).toHaveBeenCalledWith('player-1');
    expect(result.current.player).toEqual(PLAYER);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('usePlayer — not found', () => {
  test('player not found returns null player without an error', async () => {
    mockGetPlayer.mockResolvedValue(null);

    const { result } = renderHook(() => usePlayer('missing-id'), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.player).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('usePlayer — network error', () => {
  test('network error sets the error state', async () => {
    mockGetPlayer.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePlayer('player-err'), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.player).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
