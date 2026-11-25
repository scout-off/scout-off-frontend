/**
 * Issue #1064 — unit test coverage for useFeeRevenue (hooks/useFeeRevenue.ts),
 * which backs components/admin/FeeRevenueChart.tsx's platform fee revenue chart.
 * Follows the same renderHook + module-boundary mocking conventions as the
 * sibling specs under __tests__/hooks/.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/api', () => ({
  fetchFeeRevenue: jest.fn(),
}));

import { fetchFeeRevenue } from '@/lib/api';
import { useFeeRevenue } from '@/hooks/useFeeRevenue';

const mockFetch = fetchFeeRevenue as jest.Mock;

const SERIES = [
  { date: '2024-01-01', fees: 120 },
  { date: '2024-01-02', fees: 340 },
  { date: '2024-01-03', fees: 90 },
];

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue(SERIES);
});

describe('useFeeRevenue — happy path', () => {
  it('returns the revenue series shaped for the chart', async () => {
    const { result } = renderHook(() => useFeeRevenue(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(SERIES);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useFeeRevenue — loading state', () => {
  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (series: typeof SERIES) => void = () => {};
    mockFetch.mockImplementation(
      () => new Promise<typeof SERIES>((resolve) => (resolveFetch = resolve)),
    );

    const { result } = renderHook(() => useFeeRevenue(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(SERIES);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(SERIES);
  });
});

describe('useFeeRevenue — error state', () => {
  it('returns the error message when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to load fee revenue'));

    const { result } = renderHook(() => useFeeRevenue(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to load fee revenue');
    expect(result.current.loading).toBe(false);
  });
});

describe('useFeeRevenue — date-range filter', () => {
  it('passes the date-range argument through to the underlying fetch', async () => {
    const range = { from: '2024-01-01', to: '2024-01-31' };

    const { result } = renderHook(() => useFeeRevenue(range), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(range);
    expect(result.current.data).toEqual(SERIES);
  });
});
