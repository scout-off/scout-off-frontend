import {
  isNetworkError,
  submitSignedTransaction,
  SorobanRpcError,
} from '@/lib/sorobanRpc';

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

// #1782: deterministic JSON-RPC errors are rejected, transient ones retryable.
describe('submitSignedTransaction JSON-RPC error classification', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function respondWith(error: { code?: number; message?: string }) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 1, error }),
    }) as unknown as typeof fetch;
  }

  async function caught(): Promise<SorobanRpcError> {
    try {
      await submitSignedTransaction('signed-xdr');
    } catch (err) {
      return err as SorobanRpcError;
    }
    throw new Error('expected submitSignedTransaction to throw');
  }

  it.each([-32600, -32601, -32602])(
    'classifies %i as rejected (not retryable)',
    async (code) => {
      respondWith({ code, message: 'invalid params' });
      const err = await caught();
      expect(err).toBeInstanceOf(SorobanRpcError);
      expect(err.kind).toBe('rejected');
      expect(isNetworkError(err)).toBe(false);
      expect(err.message).toBe(`Soroban RPC error ${code}: invalid params`);
    },
  );

  it.each([-32603, -32000, -32050, -32099])(
    'keeps %i retryable as a network error',
    async (code) => {
      respondWith({ code, message: 'server error' });
      const err = await caught();
      expect(err.kind).toBe('network');
      expect(isNetworkError(err)).toBe(true);
      expect(err.message).toContain(String(code));
    },
  );

  it('keeps an error without a code retryable', async () => {
    respondWith({ message: 'something went wrong' });
    const err = await caught();
    expect(err.kind).toBe('network');
    expect(err.message).toBe('something went wrong');
  });
});
