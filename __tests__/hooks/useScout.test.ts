'use client';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useScout } from '@/hooks/useScout';
import type { Player } from '@/types';

jest.mock('@/lib/contract', () => ({
  filterPlayers: jest.fn(),
}));

import { filterPlayers } from '@/lib/contract';

const mockFilterPlayers = filterPlayers as jest.Mock;

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
    name: 'Alice',
    age: 22,
    position: 'FW',
    region: 'EU',
    nationality: 'DE',
  },
  ipfsHash: 'QmTestHash',
  progressLevel: 1,
  milestones: [],
  createdAt: 1_000_000,
};

describe('useScout', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('filter call returns player list on success', async () => {
    mockFilterPlayers.mockResolvedValue([mockPlayer]);

    const { result } = renderHook(() => useScout(), { wrapper });

    await act(async () => {
      result.current.search({ region: 'EU', position: 'FW', minLevel: 1 });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockFilterPlayers).toHaveBeenCalledWith('EU', 'FW', 1);
    expect(result.current.players).toEqual([mockPlayer]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('loading is true while fetch is in-flight', async () => {
    let resolveFilter!: (value: Player[]) => void;
    const pending = new Promise<Player[]>((res) => {
      resolveFilter = res;
    });
    mockFilterPlayers.mockReturnValue(pending);

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() => {
      result.current.search({ region: 'EU', position: 'FW', minLevel: 0 });
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFilter([]);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
  });

  test('error is set on contract call failure', async () => {
    mockFilterPlayers.mockRejectedValue(new Error('RPC connection failed'));

    const { result } = renderHook(() => useScout(), { wrapper });

    await act(async () => {
      result.current.search({ region: 'EU', position: 'FW', minLevel: 0 });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('RPC connection failed');
    expect(result.current.players).toEqual([]);
  });
});
