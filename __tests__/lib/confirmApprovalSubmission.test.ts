/**
 * Unit tests for the validator approval submit → confirm → reconcile pipeline.
 */

import {
  isOnChainApproved,
  submitAndConfirmApproval,
} from '@/lib/confirmApprovalSubmission';
import { TransactionFailedError, TransactionTimeoutError } from '@/lib/stellar';

const mockPollTransaction = jest.fn();

jest.mock('@/lib/stellar', () => {
  const actual = jest.requireActual('@/lib/stellar');
  return {
    ...actual,
    pollTransaction: (...args: unknown[]) => mockPollTransaction(...args),
  };
});

describe('isOnChainApproved', () => {
  it('treats success and event_lag as on-chain approved', () => {
    expect(isOnChainApproved('success')).toBe(true);
    expect(isOnChainApproved('event_lag')).toBe(true);
    expect(isOnChainApproved('failed')).toBe(false);
    expect(isOnChainApproved('timeout')).toBe(false);
    expect(isOnChainApproved('error')).toBe(false);
  });
});

describe('submitAndConfirmApproval', () => {
  const HASH = 'confirmed-tx-hash-abc';
  const playerId = 'player-1';
  const validatorAddress = 'GVALIDATOR';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('(a) immediate success: ledger confirm + event seen → success', async () => {
    mockPollTransaction.mockResolvedValue({ status: 'SUCCESS' });
    const waitForEvent = jest.fn().mockResolvedValue(true);
    const phases: string[] = [];

    const result = await submitAndConfirmApproval({
      buildXdr: async () => 'xdr',
      signAndSubmit: async () => HASH,
      playerId,
      validatorAddress,
      waitForEvent,
      onPhase: (p) => phases.push(p),
    });

    expect(result).toEqual({
      phase: 'success',
      hash: HASH,
      message: expect.stringMatching(/confirmed/i),
    });
    expect(phases).toEqual(
      expect.arrayContaining(['signing', 'submitted', 'confirming', 'success']),
    );
    expect(mockPollTransaction).toHaveBeenCalledWith(
      HASH,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it('(b) TransactionFailedError after acceptance → failed, distinct message', async () => {
    mockPollTransaction.mockRejectedValue(new TransactionFailedError(HASH));
    const waitForEvent = jest.fn();

    const result = await submitAndConfirmApproval({
      buildXdr: async () => 'xdr',
      signAndSubmit: async () => HASH,
      playerId,
      validatorAddress,
      waitForEvent,
    });

    expect(result.phase).toBe('failed');
    expect(result.hash).toBe(HASH);
    expect(result.message).toMatch(/failed on the ledger/i);
    expect(waitForEvent).not.toHaveBeenCalled();
  });

  it('(c) TransactionTimeoutError → timeout, distinct message', async () => {
    mockPollTransaction.mockRejectedValue(
      new TransactionTimeoutError(HASH, 20),
    );
    const waitForEvent = jest.fn();

    const result = await submitAndConfirmApproval({
      buildXdr: async () => 'xdr',
      signAndSubmit: async () => HASH,
      playerId,
      validatorAddress,
      waitForEvent,
    });

    expect(result.phase).toBe('timeout');
    expect(result.hash).toBe(HASH);
    expect(result.message).toMatch(/not confirmed on-chain in time/i);
    expect(waitForEvent).not.toHaveBeenCalled();
  });

  it('(d) confirmed on-chain but event never arrives → event_lag', async () => {
    mockPollTransaction.mockResolvedValue({ status: 'SUCCESS' });
    const waitForEvent = jest.fn().mockResolvedValue(false);

    const result = await submitAndConfirmApproval({
      buildXdr: async () => 'xdr',
      signAndSubmit: async () => HASH,
      playerId,
      validatorAddress,
      waitForEvent,
    });

    expect(result.phase).toBe('event_lag');
    expect(result.hash).toBe(HASH);
    expect(result.message).toMatch(/activity feed has not caught up/i);
    expect(isOnChainApproved(result.phase)).toBe(true);
  });

  it('surfaces submit/network errors distinctly (no hash, phase=error)', async () => {
    mockPollTransaction.mockResolvedValue({ status: 'SUCCESS' });

    const result = await submitAndConfirmApproval({
      buildXdr: async () => 'xdr',
      signAndSubmit: async () => {
        throw new Error('Freighter rejected the request');
      },
      playerId,
      validatorAddress,
      waitForEvent: jest.fn(),
    });

    expect(result.phase).toBe('error');
    expect(result.hash).toBeNull();
    expect(result.message).toMatch(/Freighter rejected/i);
    expect(mockPollTransaction).not.toHaveBeenCalled();
  });

  it('exposes the real hash on onPhase as soon as submit returns', async () => {
    mockPollTransaction.mockResolvedValue({ status: 'SUCCESS' });
    const seenHashes: Array<string | null> = [];

    await submitAndConfirmApproval({
      buildXdr: async () => 'xdr',
      signAndSubmit: async () => HASH,
      playerId,
      validatorAddress,
      waitForEvent: async () => true,
      onPhase: (_phase, meta) => {
        seenHashes.push(meta.hash);
      },
    });

    expect(seenHashes).toContain(HASH);
  });
});
