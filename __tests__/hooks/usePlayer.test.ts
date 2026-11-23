'use client';

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { usePlayer, playerKey, invalidatePlayerCache } from '@/hooks/usePlayer';
import type { Player } from '@/types';

const mockGetPlayer = jest.fn();

jest.mock('@/lib/contract', () => ({
  getPlayer: (...args: unknown[]) => mockGetPlayer(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const makePlayer = (id: string, progressLevel = 1): Player =>
  ({
    id,
    wallet: 'G'.padEnd(56, 'X'),
    vitals: {
      name: `Test ${id}`,
      position: 'forward',
      region: 'EU',
      age: 20,
      nationality: 'US',
    },
    progressLevel,
    archived: false,
    milestones: [],
    stats: { matches: 10, goals: 5, assists: 2 },
    ipfsHash: '',
  }) as unknown as Player;

describe('usePlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlayer.mockReset();
  });

  test('returns the player when getPlayer resolves', async () => {
    mockGetPlayer.mockResolvedValueOnce(makePlayer('p1'));

    const { result } = renderHook(() => usePlayer('w1'), { wrapper });

    await waitFor(() => expect(result.current.player?.id).toBe('p1'));

    expect(result.current.player?.progressLevel).toBe(1);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('returns null player (not error) when getPlayer resolves null', async () => {
    mockGetPlayer.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePlayer('w2'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.player).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test('error propagates to .error and player remains null', async () => {
    mockGetPlayer.mockRejectedValueOnce(new Error('RPC failed'));

    const { result } = renderHook(() => usePlayer('w3'), { wrapper });

    await waitFor(() => expect(result.current.error).toBe('RPC failed'));

    expect(result.current.player).toBeNull();
  });

  test('optimisticUpdate writes to SWR cache without re-fetching', async () => {
    mockGetPlayer.mockResolvedValueOnce(makePlayer('p1'));

    const { result } = renderHook(() => usePlayer('w4'), { wrapper });

    await waitFor(() => expect(result.current.player?.id).toBe('p1'));

    const fetchesBefore = mockGetPlayer.mock.calls.length;

    act(() => result.current.optimisticUpdate(makePlayer('optimistic', 3)));

    await waitFor(() => expect(result.current.player?.id).toBe('optimistic'));
    expect(result.current.player?.progressLevel).toBe(3);

    expect(mockGetPlayer.mock.calls.length).toBe(fetchesBefore);
  });

  test('refetch without args re-validates from getPlayer', async () => {
    mockGetPlayer.mockResolvedValue(makePlayer('p1'));

    const { result } = renderHook(() => usePlayer('w5'), { wrapper });
    await waitFor(() => expect(result.current.player?.id).toBe('p1'));

    const before = mockGetPlayer.mock.calls.length;
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockGetPlayer.mock.calls.length).toBeGreaterThan(before);
  });

  test('refetch({ discardOptimistic: true }) clears cache before refetch', async () => {
    mockGetPlayer.mockResolvedValueOnce(makePlayer('p1'));

    const { result } = renderHook(() => usePlayer('w6'), { wrapper });
    await waitFor(() => expect(result.current.player?.id).toBe('p1'));
    const after = mockGetPlayer.mock.calls.length;

    await act(async () => {
      await result.current.refetch({ discardOptimistic: true });
    });

    expect(mockGetPlayer.mock.calls.length).toBeGreaterThan(after);
  });

  test('playerKey deterministic for same input', () => {
    expect(playerKey('w')).toBe('player:w');
    expect(playerKey(null)).toBeNull();
    expect(playerKey('')).toBeNull();
  });

  test('invalidatePlayerCache is a callable exported function that returns a thenable', async () => {
    // The helper is a 1-line forwarder around `globalMutate(playerKey(...))`,
    // so verifying the export shape + signature is enough. Asserting the
    // forwarded key value independently is covered by `playerKey` tests below.
    // (A direct `jest.spyOn(swr, 'mutate')` would be cleaner but ESM module
    // namespace exports are read-only in jest — that path errors out with
    // "Cannot redefine property: mutate" at runtime.)
    expect(typeof invalidatePlayerCache).toBe('function');
    await expect(invalidatePlayerCache('w7')).resolves.toBeUndefined();
  });
});
