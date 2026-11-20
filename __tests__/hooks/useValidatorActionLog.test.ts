/**
 * Issue #1070 — hook test coverage suite.
 * Tests for useValidatorActionLog (hooks/useValidatorActionLog.ts), which reads
 * a validator's own approve/revoke action history.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/api', () => ({
  fetchValidatorActionLog: jest.fn(),
}));

import { fetchValidatorActionLog } from '@/lib/api';
import { useValidatorActionLog } from '@/hooks/useValidatorActionLog';
import type { ValidatorActionLogEntry } from '@/types';

const mockFetch = fetchValidatorActionLog as jest.Mock;

const VALIDATOR = 'GVALIDATORWALLETABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD';

const ENTRY: ValidatorActionLogEntry = {
  id: 'action-1',
  validator: VALIDATOR,
  action: 'approve',
  playerId: 'player-1',
  timestamp: 1_900_000_000,
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
  mockFetch.mockResolvedValue({ entries: [ENTRY], nextCursor: null });
});

describe('useValidatorActionLog — happy path', () => {
  it('returns the action log for a validator address', async () => {
    const { result } = renderHook(() => useValidatorActionLog(VALIDATOR), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(VALIDATOR, undefined);
    expect(result.current.entries).toEqual([ENTRY]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorActionLog — pagination', () => {
  it('passes the cursor through and exposes the next cursor', async () => {
    mockFetch.mockResolvedValue({ entries: [ENTRY], nextCursor: 'cursor-2' });

    const { result } = renderHook(
      () => useValidatorActionLog(VALIDATOR, 'cursor-1'),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(VALIDATOR, 'cursor-1');
    expect(result.current.nextCursor).toBe('cursor-2');
  });
});

describe('useValidatorActionLog — loading state', () => {
  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (value: {
      entries: ValidatorActionLogEntry[];
      nextCursor: string | null;
    }) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise<{ entries: ValidatorActionLogEntry[]; nextCursor: string | null }>(
          (resolve) => (resolveFetch = resolve),
        ),
    );

    const { result } = renderHook(() => useValidatorActionLog(VALIDATOR), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch({ entries: [ENTRY], nextCursor: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([ENTRY]);
  });

  it('does not fetch when validator address is null', async () => {
    const { result } = renderHook(() => useValidatorActionLog(null), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useValidatorActionLog — error state', () => {
  it('returns the error message when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Action log unavailable'));

    const { result } = renderHook(() => useValidatorActionLog(VALIDATOR), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBe('Action log unavailable');
    expect(result.current.loading).toBe(false);
  });
});
