'use client';
/**
 * Tests for hooks/useSubscription.ts
 *
 * Acceptance criteria from issue #999:
 *
 *  AC-1  subscribe() does not report success until the transaction is confirmed
 *        on-chain (pollTransaction resolves inside signAndSubmitTx).
 *  AC-2  A confirmed on-chain failure (TransactionFailedError) surfaces as a
 *        distinct, actionable error state (subscribeStatus === 'failed').
 *  AC-3  A confirmation timeout (TransactionTimeoutError) surfaces as a distinct
 *        state (subscribeStatus === 'timeout') with a message advising the scout
 *        to check their wallet before retrying.
 *  AC-4  The subscribe action is guarded against duplicate submissions while a
 *        purchase is in flight — the second call returns the same promise without
 *        building/signing/submitting a second transaction.
 *  AC-5  SWR revalidation (mutate) fires only after confirmed success, never at
 *        submission time.
 *  AC-6  signOnly (not signAndSubmit) is passed as the signing callback, so
 *        signAndSubmitTx can handle submission + polling correctly without a
 *        double-submit.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  getSubscription: jest.fn(),
  subscribe: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import {
  getSubscription,
  subscribe as contractSubscribe,
} from '@/lib/contract';
import { useSubscription, SubscribeStatus } from '@/hooks/useSubscription';
import { TransactionFailedError, TransactionTimeoutError } from '@/lib/stellar';

const mockUseWallet = useWallet as jest.Mock;
const mockGetSubscription = getSubscription as jest.Mock;
const mockContractSubscribe = contractSubscribe as jest.Mock;

const PUBLIC_KEY =
  'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    publicKey: PUBLIC_KEY,
    signAndSubmit: jest.fn().mockResolvedValue('txhash'),
    signOnly: jest.fn().mockResolvedValue('signedXDR'),
    ...overrides,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSubscription(expiresAtOffset = 1000) {
  return {
    scout: PUBLIC_KEY,
    tier: 'pro' as const,
    expiresAt: Date.now() / 1000 + expiresAtOffset,
  };
}

// ── read-path tests ───────────────────────────────────────────────────────────

describe('useSubscription – read path', () => {
  beforeEach(() => jest.resetAllMocks());

  it('isExpired is true when expiresAt is in the past', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue({
      scout: PUBLIC_KEY,
      tier: 'basic',
      expiresAt: Date.now() / 1000 - 1000,
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isExpired).toBe(true);
  });

  it('isExpired is false when expiresAt is in the future', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(makeSubscription());

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isExpired).toBe(false);
  });

  it('returns null subscription when wallet is not connected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      signOnly: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    expect(result.current.subscription).toBeNull();
  });
});

// ── AC-1: subscribe waits for confirmation ────────────────────────────────────

describe('useSubscription – AC-1: subscribe waits for on-chain confirmation', () => {
  beforeEach(() => jest.resetAllMocks());

  it('subscribe() does not resolve until contractSubscribe (which polls) resolves', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);

    let resolveContractSubscribe!: () => void;
    mockContractSubscribe.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveContractSubscribe = resolve;
      }),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let resolved = false;
    act(() => {
      result.current.subscribe('pro').then(() => {
        resolved = true;
      });
    });

    // Not yet resolved — still waiting for pollTransaction inside contractSubscribe
    expect(resolved).toBe(false);
    expect(result.current.subscribeStatus).not.toBe('confirmed');

    await act(async () => {
      resolveContractSubscribe();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(resolved).toBe(true);
    expect(result.current.subscribeStatus).toBe('confirmed');
  });

  it('status transitions idle → submitting → confirming → confirmed on success', async () => {
    const signOnly = jest.fn().mockResolvedValue('signedXDR');
    mockUseWallet.mockReturnValue(makeWallet({ signOnly }));
    mockGetSubscription.mockResolvedValue(null);

    // contractSubscribe calls signOnlyWithStatusUpdate which sets confirming
    // then resolves — simulate that by making contractSubscribe call signFn
    mockContractSubscribe.mockImplementation(
      async (
        _scout: string,
        _tier: string,
        signFn: (xdr: string) => Promise<string>,
      ) => {
        await signFn('xdr_payload'); // triggers confirming status
        // simulate polling delay
        await new Promise((r) => setTimeout(r, 0));
      },
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.subscribeStatus).toBe('idle');

    await act(async () => {
      await result.current.subscribe('pro');
    });

    expect(result.current.subscribeStatus).toBe('confirmed');
  });

  it('sets status to confirming after signOnly resolves but before contractSubscribe resolves', async () => {
    const signOnly = jest.fn().mockResolvedValue('signedXDR');
    mockUseWallet.mockReturnValue(makeWallet({ signOnly }));
    mockGetSubscription.mockResolvedValue(null);

    let resolveContractSubscribe!: () => void;
    const contractPromise = new Promise<void>((resolve) => {
      resolveContractSubscribe = resolve;
    });

    mockContractSubscribe.mockImplementation(
      async (
        _scout: string,
        _tier: string,
        signFn: (xdr: string) => Promise<string>,
      ) => {
        await signFn('xdr_payload'); // sets confirming
        return contractPromise; // simulate pending poll
      },
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.subscribe('pro');
    });

    // After signOnly resolves, status should be confirming
    await waitFor(() =>
      expect(result.current.subscribeStatus).toBe('confirming'),
    );

    // Resolve the poll
    await act(async () => {
      resolveContractSubscribe();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.subscribeStatus).toBe('confirmed');
  });
});

// ── AC-2: on-chain failure ────────────────────────────────────────────────────

describe('useSubscription – AC-2: on-chain failure surfaces as distinct state', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sets subscribeStatus to "failed" when TransactionFailedError is thrown', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockRejectedValue(
      new TransactionFailedError('txhash_abc'),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe('pro').catch(() => {});
    });

    expect(result.current.subscribeStatus).toBe('failed');
    expect(result.current.error).toMatch(/rejected on-chain/i);
  });

  it('rethrows TransactionFailedError so the calling UI can handle it', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockRejectedValue(
      new TransactionFailedError('txhash_abc'),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let caught: unknown;
    await act(async () => {
      await result.current.subscribe('pro').catch((e) => {
        caught = e;
      });
    });

    expect(caught).toBeInstanceOf(TransactionFailedError);
  });
});

// ── AC-3: confirmation timeout ────────────────────────────────────────────────

describe('useSubscription – AC-3: confirmation timeout surfaces as distinct state', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sets subscribeStatus to "timeout" when TransactionTimeoutError is thrown', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockRejectedValue(
      new TransactionTimeoutError('txhash_def', 20),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe('pro').catch(() => {});
    });

    expect(result.current.subscribeStatus).toBe('timeout');
    expect(result.current.error).toMatch(/timed out/i);
    expect(result.current.error).toMatch(/wallet history/i);
  });

  it('rethrows TransactionTimeoutError so the calling UI can handle it', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockRejectedValue(
      new TransactionTimeoutError('txhash_def', 20),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let caught: unknown;
    await act(async () => {
      await result.current.subscribe('pro').catch((e) => {
        caught = e;
      });
    });

    expect(caught).toBeInstanceOf(TransactionTimeoutError);
  });
});

// ── AC-4: duplicate submission guard ─────────────────────────────────────────

describe('useSubscription – AC-4: duplicate submission guard', () => {
  beforeEach(() => jest.resetAllMocks());

  it('a rapid double-click submits only one transaction (useSubmissionGuard dedup)', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);

    let resolveContractSubscribe!: () => void;
    mockContractSubscribe.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveContractSubscribe = resolve;
      }),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.subscribe('pro');
      second = result.current.subscribe('pro');
    });

    await act(async () => {
      resolveContractSubscribe!();
      await Promise.all([first, second]);
    });

    // contractSubscribe must have been called exactly once
    expect(mockContractSubscribe).toHaveBeenCalledTimes(1);
  });

  it('both calls resolve with the same result when dedup fires', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(makeSubscription());

    let resolveContractSubscribe!: () => void;
    mockContractSubscribe.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveContractSubscribe = resolve;
      }),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const results: Array<void> = [];
    act(() => {
      result.current.subscribe('pro').then((r) => results.push(r));
      result.current.subscribe('pro').then((r) => results.push(r));
    });

    await act(async () => {
      resolveContractSubscribe!();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(results).toHaveLength(2);
    expect(mockContractSubscribe).toHaveBeenCalledTimes(1);
  });

  it('isConfirming is true while a purchase is in flight', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);

    let resolveContractSubscribe!: () => void;
    mockContractSubscribe.mockImplementation(
      async (
        _scout: string,
        _tier: string,
        signFn: (xdr: string) => Promise<string>,
      ) => {
        await signFn('xdr'); // triggers confirming
        return new Promise<void>((resolve) => {
          resolveContractSubscribe = resolve;
        });
      },
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.subscribe('pro');
    });

    await waitFor(() => expect(result.current.isConfirming).toBe(true));

    await act(async () => {
      resolveContractSubscribe!();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isConfirming).toBe(false);
  });
});

// ── AC-5: SWR mutate fires only after confirmation ────────────────────────────

describe('useSubscription – AC-5: SWR mutate fires only after confirmation', () => {
  beforeEach(() => jest.resetAllMocks());

  it('mutate is NOT called while contractSubscribe is still polling', async () => {
    const signOnly = jest.fn().mockResolvedValue('signedXDR');
    mockUseWallet.mockReturnValue(makeWallet({ signOnly }));

    const mutateCallTimes: string[] = [];
    mockGetSubscription.mockImplementation(() => {
      mutateCallTimes.push(new Date().toISOString());
      return Promise.resolve(null);
    });

    let resolveContractSubscribe!: () => void;
    mockContractSubscribe.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveContractSubscribe = resolve;
      }),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    // Initial SWR fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const callCountBeforeSubscribe = mutateCallTimes.length;

    act(() => {
      result.current.subscribe('pro');
    });

    // Wait a tick — should NOT have triggered another fetch yet
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(mutateCallTimes.length).toBe(callCountBeforeSubscribe);

    // Now resolve — mutate fires AFTER confirmation
    await act(async () => {
      resolveContractSubscribe!();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(mutateCallTimes.length).toBeGreaterThan(callCountBeforeSubscribe);
  });

  it('mutate is NOT called when contractSubscribe rejects (failed tx)', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    let getSubscriptionCallCount = 0;
    mockGetSubscription.mockImplementation(() => {
      getSubscriptionCallCount++;
      return Promise.resolve(null);
    });
    mockContractSubscribe.mockRejectedValue(
      new TransactionFailedError('txhash_fail'),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const countBefore = getSubscriptionCallCount;

    await act(async () => {
      await result.current.subscribe('pro').catch(() => {});
    });

    // getSubscription should not have been called again (no mutate on failure)
    expect(getSubscriptionCallCount).toBe(countBefore);
  });
});

// ── AC-6: signOnly is used, not signAndSubmit ─────────────────────────────────

describe('useSubscription – AC-6: signOnly (not signAndSubmit) is passed to contractSubscribe', () => {
  beforeEach(() => jest.resetAllMocks());

  it('passes signOnly as the signing callback to contractSubscribe', async () => {
    const signOnly = jest.fn().mockResolvedValue('signedXDR');
    const signAndSubmit = jest.fn().mockResolvedValue('txhash');
    mockUseWallet.mockReturnValue(makeWallet({ signOnly, signAndSubmit }));
    mockGetSubscription.mockResolvedValue(null);

    // Capture what signFn was passed
    let capturedSignFn: ((xdr: string) => Promise<string>) | null = null;
    mockContractSubscribe.mockImplementation(
      async (
        _scout: string,
        _tier: string,
        signFn: (xdr: string) => Promise<string>,
      ) => {
        capturedSignFn = signFn;
        // call the signFn to simulate what signAndSubmitTx does
        await signFn('test_xdr');
      },
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe('pro');
    });

    // signOnly was called (via the status-update wrapper), signAndSubmit was not
    expect(signOnly).toHaveBeenCalledWith('test_xdr');
    expect(signAndSubmit).not.toHaveBeenCalled();

    // contractSubscribe was called with a signFn (our status-update wrapper),
    // not directly with signAndSubmit
    expect(mockContractSubscribe).toHaveBeenCalledWith(
      PUBLIC_KEY,
      'pro',
      expect.any(Function),
    );

    // The captured signFn is the wrapper, not signAndSubmit directly
    expect(capturedSignFn).not.toBe(signAndSubmit);
  });

  it('does NOT call signAndSubmit at all during subscribe()', async () => {
    const signOnly = jest.fn().mockResolvedValue('signedXDR');
    const signAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue(makeWallet({ signOnly, signAndSubmit }));
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe('basic');
    });

    expect(signAndSubmit).not.toHaveBeenCalled();
  });
});

// ── general error handling ────────────────────────────────────────────────────

describe('useSubscription – general error handling', () => {
  beforeEach(() => jest.resetAllMocks());

  it('InsufficientFee error is surfaced via error state and subscribeStatus is "failed"', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockRejectedValue(new Error('InsufficientFee'));

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let caught: unknown;
    await act(async () => {
      await result.current.subscribe('basic').catch((e) => {
        caught = e;
      });
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('InsufficientFee');
    expect(result.current.error).toBe('InsufficientFee');
    expect(result.current.subscribeStatus).toBe('failed');
  });

  it('throws when wallet is not connected', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      signOnly: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockGetSubscription.mockResolvedValue(null);

    const { result } = renderHook(() => useSubscription(), { wrapper });

    let caught: unknown;
    await act(async () => {
      await result.current.subscribe('pro').catch((e) => {
        caught = e;
      });
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/wallet not connected/i);
  });

  it('loading is false after subscribe resolves', async () => {
    mockUseWallet.mockReturnValue(makeWallet());
    mockGetSubscription.mockResolvedValue(null);
    mockContractSubscribe.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe('pro');
    });

    expect(result.current.loading).toBe(false);
  });
});
