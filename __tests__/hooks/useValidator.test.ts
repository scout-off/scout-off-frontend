'use client';

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useValidator, invalidateValidatorCache } from '@/hooks/useValidator';
import type { ValidatorInfo } from '@/types';

const PUBLIC_KEY = 'G'.padEnd(56, 'X');

const mockUseWallet = jest.fn();
const mockGetValidators = jest.fn();
const mockBuildApproveMilestone = jest.fn();
const mockBuildRevokeMilestone = jest.fn();
const mockSignAndSubmit = jest.fn();
const mockParseContractError = jest.fn();

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}));

jest.mock('@/lib/contract', () => ({
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
  buildApproveMilestone: (...args: unknown[]) =>
    mockBuildApproveMilestone(...args),
  buildRevokeMilestone: (...args: unknown[]) =>
    mockBuildRevokeMilestone(...args),
}));

jest.mock('@/lib/contractErrorMessage', () => ({
  parseContractError: (...args: unknown[]) => mockParseContractError(args[0]),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const makeValidator = (over: Partial<ValidatorInfo> = {}): ValidatorInfo =>
  ({
    address: PUBLIC_KEY,
    name: 'validator',
    ...over,
  }) as unknown as ValidatorInfo;

const setupWalletConnected = () => {
  mockUseWallet.mockReturnValue({
    publicKey: PUBLIC_KEY,
    signAndSubmit: mockSignAndSubmit,
  });
};

describe('useValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupWalletConnected();
    mockGetValidators.mockReset();
    mockBuildApproveMilestone.mockReset();
    mockBuildRevokeMilestone.mockReset();
    mockSignAndSubmit.mockReset();
    mockParseContractError.mockImplementation((e: unknown) =>
      e instanceof Error ? e.message : 'unknown',
    );
  });

  test('isValidator true when wallet address is in the validators list', async () => {
    mockGetValidators.mockResolvedValueOnce([
      makeValidator({ address: PUBLIC_KEY }),
      makeValidator({
        address: 'G'.padEnd(56, 'Y'),
        addedBy: 'G'.padEnd(56, 'Z'),
      }),
    ]);

    const { result } = renderHook(() => useValidator(), { wrapper });

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.isValidator).toBe(true);
  });

  test('isValidator false when wallet address is NOT in the validators list', async () => {
    mockGetValidators.mockResolvedValueOnce([
      makeValidator({
        address: 'G'.padEnd(56, 'Y'),
        addedBy: 'G'.padEnd(56, 'Z'),
      }),
    ]);

    const { result } = renderHook(() => useValidator(), { wrapper });

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.isValidator).toBe(false);
  });

  test('approveMilestone happy path: returns the XDR, no error', async () => {
    mockGetValidators.mockResolvedValueOnce([makeValidator()]);
    mockBuildApproveMilestone.mockResolvedValueOnce('approve-xdr');

    const { result } = renderHook(() => useValidator(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));

    let out: unknown;
    await act(async () => {
      out = await result.current.approveMilestone('p1', 'milestone-1');
    });

    expect(out).toBe('approve-xdr');
    expect(mockBuildApproveMilestone).toHaveBeenCalledWith(
      PUBLIC_KEY,
      'p1',
      'milestone-1',
    );
    expect(result.current.error).toBeNull();
  });

  test('approveMilestone failure: parseContractError mapped to error state', async () => {
    mockGetValidators.mockResolvedValueOnce([makeValidator()]);
    mockBuildApproveMilestone.mockRejectedValueOnce(new Error('Unauthorized'));
    mockParseContractError.mockReturnValueOnce('Not a validator');

    const { result } = renderHook(() => useValidator(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));

    await act(async () => {
      try {
        await result.current.approveMilestone('p1', 'milestone-1');
      } catch {
        /* swallow */
      }
    });

    expect(mockParseContractError).toHaveBeenCalled();
    expect(result.current.error).toBe('Not a validator');
  });

  test('approveMilestone throws when wallet not connected', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      signAndSubmit: mockSignAndSubmit,
    });
    mockGetValidators.mockResolvedValueOnce([
      makeValidator({ address: 'G'.padEnd(56, 'Y') }),
    ]);

    const { result } = renderHook(() => useValidator(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));

    await act(async () => {
      try {
        await result.current.approveMilestone('p1', 'milestone-1');
        fail('expected throw');
      } catch (e) {
        expect((e as Error).message).toMatch(/not connected/i);
      }
    });
  });

  test('revokeMilestone happy path: signs revoke tx, returns tx result', async () => {
    mockGetValidators.mockResolvedValueOnce([makeValidator()]);
    mockBuildRevokeMilestone.mockResolvedValueOnce('revoke-xdr');
    // signAndSubmit resolves the on-chain tx hash; revokeMilestone reports
    // it back as `{ hash, confirmed }` (see hooks/useValidator.ts).
    mockSignAndSubmit.mockResolvedValueOnce('revoke-tx-hash');

    const { result } = renderHook(() => useValidator(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));

    let out: unknown;
    await act(async () => {
      out = await result.current.revokeMilestone('p1', 'milestone-1');
    });

    expect(out).toEqual({ hash: 'revoke-tx-hash', confirmed: true });
    expect(mockBuildRevokeMilestone).toHaveBeenCalledWith(
      PUBLIC_KEY,
      'p1',
      'milestone-1',
    );
    expect(mockSignAndSubmit).toHaveBeenCalledWith('revoke-xdr');
  });

  test('invalidateValidatorCache exported helper resolves cleanly', async () => {
    await expect(invalidateValidatorCache()).resolves.toBeUndefined();
  });
});
