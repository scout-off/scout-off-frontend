import { withTimeoutSignal } from '@/lib/fetchTimeout';

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
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });

    await jest.advanceTimersByTimeAsync(100);
    await assertion;

    expect(run.mock.calls[0][0].aborted).toBe(true);
  });
});
