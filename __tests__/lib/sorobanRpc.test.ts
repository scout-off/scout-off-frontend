import { submitSignedTransaction, SorobanRpcError } from '@/lib/sorobanRpc';

describe('submitSignedTransaction', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('aborts a timed-out RPC request and classifies it as retryable', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        requestSignal!.addEventListener(
          'abort',
          () => reject(requestSignal!.reason),
          { once: true },
        );
      });
    }) as jest.MockedFunction<typeof fetch>;

    const pending = submitSignedTransaction('signed-xdr');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'SorobanRpcError',
      kind: 'network',
    } satisfies Partial<SorobanRpcError>);
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    expect(requestSignal?.aborted).toBe(true);
  });
});
