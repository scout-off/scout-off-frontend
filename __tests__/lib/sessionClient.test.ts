import { getServerSession, refreshSession } from '@/lib/sessionClient';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

describe('getServerSession', () => {
  it('returns authenticated: true with the public key on a 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, publicKey: 'GABC' }),
    });
    expect(await getServerSession()).toEqual({
      authenticated: true,
      publicKey: 'GABC',
    });
  });

  it('returns authenticated: false on a 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await getServerSession()).toEqual({
      authenticated: false,
      publicKey: null,
    });
  });

  it('returns null (inconclusive) on a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    expect(await getServerSession()).toBeNull();
  });

  it('returns null (inconclusive) on an unexpected server error', async () => {
    // 500 is a retryable status (see lib/fetchWithRetry.ts), so every
    // attempt — not just the first — needs to see this response; fake
    // timers skip the real backoff delay between retries.
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const assertion = expect(getServerSession()).resolves.toBeNull();
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });
});

describe('refreshSession', () => {
  it('returns authenticated: true with the public key on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, publicKey: 'GABC', maxAge: 86400 }),
    });
    expect(await refreshSession()).toEqual({
      authenticated: true,
      publicKey: 'GABC',
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', {
      method: 'POST',
    });
  });

  it('returns authenticated: false when the refresh endpoint rejects', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await refreshSession()).toEqual({
      authenticated: false,
      publicKey: null,
    });
  });

  it('returns authenticated: false on a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    expect(await refreshSession()).toEqual({
      authenticated: false,
      publicKey: null,
    });
  });

  it('single-flights concurrent callers: N concurrent refreshSession() calls make exactly one underlying request', async () => {
    let resolveFetch: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const calls = Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ]);

    // All five callers should be sharing the same in-flight request.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFetch!({
      ok: true,
      json: async () => ({ success: true, publicKey: 'GABC', maxAge: 86400 }),
    });

    const results = await calls;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual({ authenticated: true, publicKey: 'GABC' });
    }
  });

  it('starts a new request for a caller after the previous refresh has settled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, publicKey: 'GABC', maxAge: 86400 }),
    });
    await refreshSession();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, publicKey: 'GABC', maxAge: 86400 }),
    });
    await refreshSession();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
