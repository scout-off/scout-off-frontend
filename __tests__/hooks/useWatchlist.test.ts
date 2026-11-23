import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import type { WatchlistEntry } from '@/types';

jest.mock('@/lib/watchlistClient', () => ({
  fetchWatchlist: jest.fn(),
  addToWatchlist: jest.fn(),
  removeFromWatchlist: jest.fn(),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: jest.fn(),
}));

import {
  addToWatchlist,
  fetchWatchlist,
  removeFromWatchlist,
} from '@/lib/watchlistClient';
import { useToast } from '@/components/ui/Toast';
import { useWatchlist } from '@/hooks/useWatchlist';

const mockFetch = fetchWatchlist as jest.Mock;
const mockAdd = addToWatchlist as jest.Mock;
const mockRemove = removeFromWatchlist as jest.Mock;
const mockUseToast = useToast as jest.Mock;

// Fresh, unshared SWR cache per test so results are deterministic.
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const ENTRY: WatchlistEntry = {
  id: 1,
  scoutWallet: 'GSCOUT',
  playerId: 'player-1',
  createdAt: 0,
};

let show: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  show = jest.fn();
  mockUseToast.mockReturnValue({ show });
  mockFetch.mockResolvedValue([ENTRY]);
  mockAdd.mockResolvedValue(ENTRY);
  mockRemove.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('useWatchlist', () => {
  test('loads entries and exposes isWatched', async () => {
    const { result } = renderHook(() => useWatchlist('GSCOUT'), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([ENTRY]);
    expect(result.current.isWatched('player-1')).toBe(true);
    expect(result.current.isWatched('player-2')).toBe(false);
  });

  test('remove hides the entry immediately and defers the DELETE call', async () => {
    const { result } = renderHook(() => useWatchlist('GSCOUT'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.remove(ENTRY);
    });

    expect(result.current.entries).toEqual([]);
    expect(mockRemove).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRemove).toHaveBeenCalledWith(1);
  });

  test('undo restores the entry and the DELETE call never fires', async () => {
    const { result } = renderHook(() => useWatchlist('GSCOUT'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.remove(ENTRY);
    });
    expect(result.current.entries).toEqual([]);

    const undo = show.mock.calls[0][0].action.onClick;
    act(() => {
      undo();
    });
    expect(result.current.entries).toEqual([ENTRY]);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test('second remove call for the same pending entry does not double-commit (issue #1132)', async () => {
    // Acceptance criterion: removing the same entry twice while the first
    // removal is still within its undo window must not fire two DELETE calls.
    const { result } = renderHook(() => useWatchlist('GSCOUT'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.remove(ENTRY);
      result.current.remove(ENTRY); // second call while timer is pending
    });

    // Only one toast shown — the second call was a no-op
    expect(show).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // DELETE fired exactly once, not twice
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  test('add calls the API and refetches', async () => {
    const { result } = renderHook(() => useWatchlist('GSCOUT'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.add('player-2');
    });

    expect(mockAdd).toHaveBeenCalledWith('player-2');
  });
});
