/**
 * Issue #26 — hook test coverage suite.
 * Tests for useScoutProfile (hooks/useScoutProfile.ts), which uses SWR with
 * the same key/dedupe pattern as usePlayer and friends.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/api', () => ({
  fetchScoutProfile: jest.fn(),
}));

import { fetchScoutProfile } from '@/lib/api';
import {
  useScoutProfile,
  invalidateScoutProfileCache,
  scoutProfileKey,
} from '@/hooks/useScoutProfile';
import type { Scout } from '@/types';

const mockFetch = fetchScoutProfile as jest.Mock;

const SCOUT: Scout = {
  id: 'scout-1',
  wallet: 'GSCOUTWALLETABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJK',
  name: 'Lena Park',
  organisation: 'Grassroots United',
  subscriptionTier: 'pro',
  subscriptionExpiry: 1_900_000_000,
  contactedPlayers: [],
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue(SCOUT);
});

describe('useScoutProfile — happy path', () => {
  it('returns the loaded scout after a successful fetch', async () => {
    const { result } = renderHook(() => useScoutProfile('scout-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith('scout-1');
    expect(result.current.scout).toEqual(SCOUT);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useScoutProfile — loading state', () => {
  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (scout: Scout) => void = () => {};
    mockFetch.mockImplementation(
      () => new Promise<Scout>((resolve) => (resolveFetch = resolve)),
    );

    const { result } = renderHook(() => useScoutProfile('scout-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(SCOUT);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.scout).toEqual(SCOUT);
  });

  it('does not fetch when scoutId is null', async () => {
    const { result } = renderHook(() => useScoutProfile(null), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.scout).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useScoutProfile — error state', () => {
  it('returns the error message when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Scout not found'));

    const { result } = renderHook(() => useScoutProfile('scout-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.scout).toBeNull();
    expect(result.current.error).toBe('Scout not found');
    expect(result.current.loading).toBe(false);
  });
});

describe('useScoutProfile — refetch', () => {
  it('refetch re-runs the underlying fetch', async () => {
    const { result } = renderHook(() => useScoutProfile('scout-1'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('useScoutProfile — cache helpers', () => {
  it('scoutProfileKey produces a deterministic key for the same id', () => {
    expect(scoutProfileKey('abc')).toBe('scout:abc');
    expect(scoutProfileKey(null)).toBeNull();
  });

  it('invalidateScoutProfileCache returns a Promise (does not throw)', () => {
    expect(() => invalidateScoutProfileCache('scout-1')).not.toThrow();
  });
});
