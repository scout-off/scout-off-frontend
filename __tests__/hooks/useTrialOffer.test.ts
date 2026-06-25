import { renderHook, act } from '@testing-library/react';
import { useTrialOffer } from '@/hooks/useTrialOffer';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  buildLogTrialOffer: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import { buildLogTrialOffer } from '@/lib/contract';

const mockUseWallet = useWallet as jest.Mock;
const mockBuildLogTrialOffer = buildLogTrialOffer as jest.Mock;

const PUBLIC_KEY = 'GABCDE1234567890ABCDE1234567890ABCDE1234567890ABCDE1234567890';
const PLAYER_ID = 'player-abc';
const DETAILS = { clubName: 'FC Test', offerType: 'trial' as const };
const MOCK_XDR = 'AAAAAwAAAAA...xdr...';
const MOCK_HASH = 'abcdef1234567890';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: any) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTrialOffer', () => {
  let mockSignAndSubmit: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    mockSignAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue({
      publicKey: PUBLIC_KEY,
      signAndSubmit: mockSignAndSubmit,
    });
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it('returns idle initial state', () => {
    const { result } = renderHook(() => useTrialOffer());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.txHash).toBeNull();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('sets loading=true while the transaction is in-flight', async () => {
    const { promise: xdrPromise, resolve: resolveXdr } = makeDeferred<string>();
    mockBuildLogTrialOffer.mockReturnValue(xdrPromise);
    mockSignAndSubmit.mockResolvedValue({ hash: MOCK_HASH });

    const { result } = renderHook(() => useTrialOffer());

    let callPromise!: Promise<void>;
    act(() => {
      callPromise = result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveXdr(MOCK_XDR);
      await callPromise;
    });

    expect(result.current.loading).toBe(false);
  });

  it('sets txHash and clears error on success', async () => {
    mockBuildLogTrialOffer.mockResolvedValue(MOCK_XDR);
    mockSignAndSubmit.mockResolvedValue({ hash: MOCK_HASH });

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.txHash).toBe(MOCK_HASH);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('passes correct args to buildLogTrialOffer', async () => {
    mockBuildLogTrialOffer.mockResolvedValue(MOCK_XDR);
    mockSignAndSubmit.mockResolvedValue({ hash: MOCK_HASH });

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(mockBuildLogTrialOffer).toHaveBeenCalledWith(PUBLIC_KEY, PLAYER_ID, DETAILS);
  });

  it('passes the built XDR to signAndSubmit', async () => {
    mockBuildLogTrialOffer.mockResolvedValue(MOCK_XDR);
    mockSignAndSubmit.mockResolvedValue({ hash: MOCK_HASH });

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(mockSignAndSubmit).toHaveBeenCalledWith(MOCK_XDR);
  });

  it('accepts a null hash from the result without throwing', async () => {
    mockBuildLogTrialOffer.mockResolvedValue(MOCK_XDR);
    mockSignAndSubmit.mockResolvedValue({}); // no .hash field

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.txHash).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('sets error and clears txHash when buildLogTrialOffer rejects', async () => {
    mockBuildLogTrialOffer.mockRejectedValue(new Error('RPC failure'));
    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.error).toBe('RPC failure');
    expect(result.current.txHash).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets error and clears txHash when signAndSubmit rejects', async () => {
    mockBuildLogTrialOffer.mockResolvedValue(MOCK_XDR);
    mockSignAndSubmit.mockRejectedValue(new Error('User rejected'));

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.error).toBe('User rejected');
    expect(result.current.txHash).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('uses a fallback message when the thrown value is not an Error', async () => {
    mockBuildLogTrialOffer.mockRejectedValue('some string error');

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.error).toBe('Transaction failed');
  });

  it('throws when the wallet is not connected', async () => {
    mockUseWallet.mockReturnValue({ publicKey: null, signAndSubmit: mockSignAndSubmit });

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });

    expect(result.current.error).toBe('Wallet not connected');
    expect(mockBuildLogTrialOffer).not.toHaveBeenCalled();
  });

  // ── State reset on new call ───────────────────────────────────────────────

  it('clears a previous error when a new call starts', async () => {
    mockBuildLogTrialOffer.mockRejectedValueOnce(new Error('first error'));
    mockBuildLogTrialOffer.mockResolvedValueOnce(MOCK_XDR);
    mockSignAndSubmit.mockResolvedValue({ hash: MOCK_HASH });

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });
    expect(result.current.error).toBe('first error');

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.txHash).toBe(MOCK_HASH);
  });

  it('clears a previous txHash when a new call starts', async () => {
    mockBuildLogTrialOffer.mockResolvedValue(MOCK_XDR);
    mockSignAndSubmit
      .mockResolvedValueOnce({ hash: MOCK_HASH })
      .mockRejectedValueOnce(new Error('second error'));

    const { result } = renderHook(() => useTrialOffer());

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });
    expect(result.current.txHash).toBe(MOCK_HASH);

    await act(async () => {
      await result.current.logTrialOffer(PLAYER_ID, DETAILS);
    });
    expect(result.current.txHash).toBeNull();
    expect(result.current.error).toBe('second error');
  });

  // ── Race condition protection ─────────────────────────────────────────────

  it('ignores the stale first call when a second call completes first', async () => {
    const first = makeDeferred<string>();
    const second = makeDeferred<string>();

    mockBuildLogTrialOffer
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mockSignAndSubmit.mockResolvedValue({ hash: MOCK_HASH });

    const { result } = renderHook(() => useTrialOffer());

    // Start call 1
    let call1!: Promise<void>;
    act(() => { call1 = result.current.logTrialOffer(PLAYER_ID, DETAILS); });

    // Start call 2 before call 1 resolves
    let call2!: Promise<void>;
    act(() => { call2 = result.current.logTrialOffer(PLAYER_ID, DETAILS); });

    // Resolve call 2 first (it's the "newer" one)
    await act(async () => {
      second.resolve(MOCK_XDR);
      await call2;
    });

    expect(result.current.txHash).toBe(MOCK_HASH);
    expect(result.current.loading).toBe(false);

    // Now resolve the stale call 1 — it must NOT overwrite state
    await act(async () => {
      first.resolve(MOCK_XDR);
      await call1;
    });

    // State should still reflect call 2's result; loading must remain false
    expect(result.current.txHash).toBe(MOCK_HASH);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
