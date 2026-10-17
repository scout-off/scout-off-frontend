import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/pathPayment', () => ({
  USDC: { code: 'USDC', issuer: 'GISSUER' },
  fetchStrictReceiveQuote: jest.fn(),
}));

import { fetchStrictReceiveQuote } from '@/lib/pathPayment';
import { useContactFeeQuote } from '@/hooks/useContactFeeQuote';

const mockFetch = fetchStrictReceiveQuote as jest.Mock;

const NOW = 1_700_000_000_000;

function makeQuote(secondsValid = 30) {
  return { sourceAmount: '1.23', expiresAt: Date.now() + secondsValid * 1000 };
}

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe('useContactFeeQuote', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    mockFetch.mockImplementation(async () => makeQuote());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useContactFeeQuote(10, false));
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.quote).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.expired).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('fetches when enabled: loading first, then the quote', async () => {
    let resolve!: (q: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useContactFeeQuote(10, true));
    expect(result.current.loading).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(10, expect.objectContaining({ code: 'USDC' }));

    await act(async () => {
      resolve(makeQuote());
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.quote).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('counts down secondsLeft and expires at 0 without refetching', async () => {
    const { result } = renderHook(() => useContactFeeQuote(10, true));
    await settle();
    expect(result.current.secondsLeft).toBe(30);
    expect(result.current.expired).toBe(false);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.secondsLeft).toBe(20);

    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.expired).toBe(true);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refresh fetches again and resets the countdown', async () => {
    const { result } = renderHook(() => useContactFeeQuote(10, true));
    await settle();
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(result.current.expired).toBe(true);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.secondsLeft).toBe(30);
    expect(result.current.expired).toBe(false);
  });

  it('sets the Error message and clears the quote on a rejected fetch', async () => {
    mockFetch.mockRejectedValue(new Error('no path found'));
    const { result } = renderHook(() => useContactFeeQuote(10, true));
    await settle();
    expect(result.current.error).toBe('no path found');
    expect(result.current.quote).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('uses the fallback message for a non-Error rejection', async () => {
    mockFetch.mockRejectedValue('weird');
    const { result } = renderHook(() => useContactFeeQuote(10, true));
    await settle();
    expect(result.current.error).toBe('Could not fetch a quote');
  });

  it('fetches again when feeXlm changes', async () => {
    const { rerender } = renderHook(
      ({ fee }) => useContactFeeQuote(fee, true),
      { initialProps: { fee: 10 } },
    );
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    rerender({ fee: 20 });
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(20, expect.anything());
  });

  it('clears the ticker interval on unmount', async () => {
    const { unmount } = renderHook(() => useContactFeeQuote(10, true));
    await settle();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
