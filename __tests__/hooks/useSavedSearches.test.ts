import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import type { SavedSearch } from '@/types';

jest.mock('@/lib/savedSearchClient', () => ({
  fetchSavedSearches: jest.fn(),
  saveSearch: jest.fn(),
  removeSavedSearch: jest.fn(),
  markSavedSearchViewed: jest.fn(),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: jest.fn(),
}));
jest.mock('@/lib/contract', () => ({
  filterPlayers: jest.fn(),
}));

import {
  fetchSavedSearches,
  markSavedSearchViewed,
  removeSavedSearch,
  saveSearch,
} from '@/lib/savedSearchClient';
import { filterPlayers } from '@/lib/contract';
import { useToast } from '@/components/ui/Toast';
import { useSavedSearches, useSavedSearchNewCount } from '@/hooks/useSavedSearches';

const mockFetch = fetchSavedSearches as jest.Mock;
const mockSave = saveSearch as jest.Mock;
const mockRemove = removeSavedSearch as jest.Mock;
const mockMarkViewed = markSavedSearchViewed as jest.Mock;
const mockFilterPlayers = filterPlayers as jest.Mock;
const mockUseToast = useToast as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const ENTRY: SavedSearch = {
  id: 1,
  scoutWallet: 'GSCOUT',
  name: 'Lagos strikers',
  filter: { region: 'Lagos', position: 'Forward' },
  createdAt: 0,
  lastViewedAt: 0,
};

let show: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  show = jest.fn();
  mockUseToast.mockReturnValue({ show });
  mockFetch.mockResolvedValue([ENTRY]);
  mockSave.mockResolvedValue(ENTRY);
  mockRemove.mockResolvedValue(undefined);
  mockMarkViewed.mockResolvedValue({ ...ENTRY, lastViewedAt: 12345 });
  mockFilterPlayers.mockResolvedValue([]);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('useSavedSearches', () => {
  test('loads saved searches', async () => {
    const { result } = renderHook(() => useSavedSearches('GSCOUT'), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.searches).toEqual([ENTRY]);
  });

  test('remove hides the entry immediately and defers the DELETE call', async () => {
    const { result } = renderHook(() => useSavedSearches('GSCOUT'), {
      wrapper,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.remove(ENTRY);
    });

    expect(result.current.searches).toEqual([]);
    expect(mockRemove).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRemove).toHaveBeenCalledWith(1);
  });

  test('undo restores the entry and the DELETE call never fires', async () => {
    const { result } = renderHook(() => useSavedSearches('GSCOUT'), {
      wrapper,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.remove(ENTRY);
    });
    expect(result.current.searches).toEqual([]);

    const undo = show.mock.calls[0][0].action.onClick;
    act(() => {
      undo();
    });
    expect(result.current.searches).toEqual([ENTRY]);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test('save calls the API and refetches', async () => {
    const { result } = renderHook(() => useSavedSearches('GSCOUT'), {
      wrapper,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.save('New search', { region: 'Accra' });
    });

    expect(mockSave).toHaveBeenCalledWith('New search', { region: 'Accra' });
  });

  test('markViewed calls the API and updates the entry in place', async () => {
    const { result } = renderHook(() => useSavedSearches('GSCOUT'), {
      wrapper,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.markViewed(ENTRY);
    });

    expect(mockMarkViewed).toHaveBeenCalledWith(1);
    expect(result.current.searches[0].lastViewedAt).toBe(12345);
  });
});

describe('useSavedSearchNewCount', () => {
  function countWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), shouldRetryOnError: false } },
      children,
    );
  }

  test('counts matching players created after lastViewedAt', async () => {
    mockFilterPlayers.mockResolvedValue([
      { id: 'p1', createdAt: 100, archived: false },
      { id: 'p2', createdAt: 50, archived: false },
      { id: 'p3', createdAt: 200, archived: false },
    ]);

    const { result } = renderHook(
      () => useSavedSearchNewCount({ region: 'Lagos' }, 75),
      { wrapper: countWrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe(2);
  });

  test('excludes archived players from the count', async () => {
    mockFilterPlayers.mockResolvedValue([
      { id: 'p1', createdAt: 100, archived: true },
      { id: 'p2', createdAt: 100, archived: false },
    ]);

    const { result } = renderHook(
      () => useSavedSearchNewCount({ region: 'Lagos' }, 0),
      { wrapper: countWrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe(1);
  });

  test('returns 0 while data has not loaded yet', () => {
    mockFilterPlayers.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useSavedSearchNewCount({ region: 'Lagos' }, 0),
      { wrapper: countWrapper },
    );
    expect(result.current).toBe(0);
  });
});
