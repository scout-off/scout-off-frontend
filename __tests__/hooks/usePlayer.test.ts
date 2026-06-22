'use client';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { usePlayer } from '@/hooks/usePlayer';
import type { Player } from '@/types';

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

import { getPlayer } from '@/lib/contract';

const mockGetPlayer = getPlayer as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, {
    value: {
      provider: () => new Map(),
      dedupingInterval: 0,
      onErrorRetry: () => {},
    },
    children,
  });

const mockPlayer: Player = {
  id: 'player-1',
  wallet: 'GABC123',
  vitals: {
    name: 'Bob',
    age: 25,
    position: 'MF',
    region: 'AF',
    nationality: 'NG',
  },
  ipfsHash: 'QmPlayerHash',
  progressLevel: 2,
  milestones: [],
  createdAt: 2_000_000,
};

describe('usePlayer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('player found returns Player object', async () => {
    mockGetPlayer.mockResolvedValue(mockPlayer);

    const { result } = renderHook(() => usePlayer('player-1'), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockGetPlayer).toHaveBeenCalledWith('player-1');
    expect(result.current.player).toEqual(mockPlayer);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('player not found returns null player without error', async () => {
    mockGetPlayer.mockResolvedValue(null);

    const { result } = renderHook(() => usePlayer('unknown-player'), {
      wrapper,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.player).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('network error sets error state', async () => {
    mockGetPlayer.mockRejectedValue(new Error('Network request failed'));

    const { result } = renderHook(() => usePlayer('player-1'), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Network request failed');
    expect(result.current.player).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('returns empty state when walletOrId is null', () => {
    const { result } = renderHook(() => usePlayer(null), { wrapper });

    expect(result.current.player).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGetPlayer).not.toHaveBeenCalled();
  });
});
