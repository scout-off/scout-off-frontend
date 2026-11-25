import { isTimeoutError, withTimeoutSignal } from '@/lib/fetchTimeout';

describe('withTimeoutSignal', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts the upstream operation when its timeout expires', async () => {
    jest.useFakeTimers();
    const run = jest.fn(
      (signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const pending = withTimeoutSignal(100, run);
    // #1778: a timeout aborts with a TimeoutError reason, not a generic AbortError.
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Timed out after 100 ms',
    });

    await jest.advanceTimersByTimeAsync(100);
    await assertion;

    expect(run.mock.calls[0][0].aborted).toBe(true);
  });

  function rejectOnAbort(signal: AbortSignal) {
    return new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
    });
  }

  it('lets callers recognise a timeout with isTimeoutError (#1778)', async () => {
    jest.useFakeTimers();
    const pending = withTimeoutSignal(50, rejectOnAbort).catch((err) => err);
    await jest.advanceTimersByTimeAsync(50);
    const err = await pending;
    expect(isTimeoutError(err)).toBe(true);
  });

  it('keeps the parent reason when the caller cancels (#1778)', async () => {
    const parent = new AbortController();
    const reason = new DOMException('User left the page', 'AbortError');
    const pending = withTimeoutSignal(10_000, rejectOnAbort, parent.signal);
    parent.abort(reason);
    const err = await pending.catch((e) => e);
    expect(err).toBe(reason);
    expect(isTimeoutError(err)).toBe(false);
  });

  it('isTimeoutError rejects other errors', () => {
    expect(isTimeoutError(new DOMException('x', 'AbortError'))).toBe(false);
    expect(isTimeoutError(new Error('boom'))).toBe(false);
    expect(isTimeoutError('TimeoutError')).toBe(false);
  });
});
