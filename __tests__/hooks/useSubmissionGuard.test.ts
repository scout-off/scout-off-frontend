import { renderHook, act } from '@testing-library/react';
import { useSubmissionGuard } from '@/hooks/useSubmissionGuard';

describe('useSubmissionGuard (issue #1177)', () => {
  test('a rapid double-submission only invokes the action once and both callers get the same result', async () => {
    const { result } = renderHook(() => useSubmissionGuard<string>());

    let resolveAction: (value: string) => void;
    const action = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveAction = resolve;
        }),
    );

    let firstPromise!: Promise<string>;
    let secondPromise!: Promise<string>;

    act(() => {
      // Simulates a fast double-click: both calls happen before either
      // has a chance to resolve.
      firstPromise = result.current(action);
      secondPromise = result.current(action);
    });

    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction('tx-hash-1');
      await Promise.resolve();
    });

    await expect(firstPromise).resolves.toBe('tx-hash-1');
    await expect(secondPromise).resolves.toBe('tx-hash-1');
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('a call with an already-completed idempotency key short-circuits without re-invoking the action', async () => {
    const { result } = renderHook(() => useSubmissionGuard<string>());
    const action = jest.fn().mockResolvedValue('tx-hash-1');
    const key = 'fixed-idempotency-key';

    let first: string;
    await act(async () => {
      first = await result.current(action, key);
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(key);

    let second: string;
    await act(async () => {
      second = await result.current(action, key);
    });

    // Simulates a retry (e.g. from an offline queue) carrying the same
    // idempotency key as an already-successful submission — recognized and
    // does not re-submit.
    expect(action).toHaveBeenCalledTimes(1);
    expect(second!).toBe(first!);
  });

  test('a new call (no explicit key) after a prior success is a genuinely new attempt', async () => {
    const { result } = renderHook(() => useSubmissionGuard<string>());
    const action = jest
      .fn()
      .mockResolvedValueOnce('tx-hash-1')
      .mockResolvedValueOnce('tx-hash-2');

    await act(async () => {
      await result.current(action);
    });
    await act(async () => {
      await result.current(action);
    });

    expect(action).toHaveBeenCalledTimes(2);
  });

  test('a failed attempt is not cached — retrying with the same key genuinely retries', async () => {
    const { result } = renderHook(() => useSubmissionGuard<string>());
    const action = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce('tx-hash-1');
    const key = 'retry-key';

    await act(async () => {
      await expect(result.current(action, key)).rejects.toThrow(
        'transient failure',
      );
    });

    let second: string;
    await act(async () => {
      second = await result.current(action, key);
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(second!).toBe('tx-hash-1');
  });

  test('sequential (non-concurrent, no explicit key) calls each run the action', async () => {
    const { result } = renderHook(() => useSubmissionGuard<string>());
    const action = jest.fn().mockResolvedValue('ok');

    await act(async () => {
      await result.current(action);
    });
    await act(async () => {
      await result.current(action);
    });

    expect(action).toHaveBeenCalledTimes(2);
  });
});
