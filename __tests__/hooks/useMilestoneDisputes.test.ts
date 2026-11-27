/**
 * Tests for useMilestoneDisputes (hooks/useMilestoneDisputes.ts), which
 * tracks the authenticated player's own milestone disputes (issue #562).
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/disputesClient', () => ({
  fetchMyDisputes: jest.fn(),
  createDispute: jest.fn(),
}));

import { createDispute, fetchMyDisputes } from '@/lib/disputesClient';
import {
  myDisputesKey,
  useMilestoneDisputes,
} from '@/hooks/useMilestoneDisputes';
import type { MilestoneDispute } from '@/types';

const mockFetch = fetchMyDisputes as jest.Mock;
const mockCreate = createDispute as jest.Mock;

const WALLET = 'GPLAYERWALLET';

function dispute(id: number, milestoneId: string): MilestoneDispute {
  return {
    id,
    playerId: 'player-1',
    playerWallet: WALLET,
    validatorWallet: 'GVALIDATOR',
    milestoneId,
    milestoneDescription: `Milestone ${milestoneId}`,
    reason: 'Milestone not delivered',
    status: 'pending',
    createdAt: 1_900_000_000,
    responseDeadline: 1_900_100_000,
    decidedAt: null,
    decidedBy: null,
    resolutionNote: null,
    revokeTxHash: null,
  };
}

const DISPUTE = dispute(1, 'milestone-1');

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        shouldRetryOnError: false,
        dedupingInterval: 0,
      },
    },
    children,
  );
}

function renderDisputes(wallet: string | null = WALLET) {
  return renderHook(() => useMilestoneDisputes(wallet), { wrapper });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue([DISPUTE]);
});

describe('myDisputesKey', () => {
  it('is null without a wallet and wallet-scoped otherwise', () => {
    expect(myDisputesKey(null)).toBeNull();
    expect(myDisputesKey(WALLET)).toBe(`disputes:mine:${WALLET}`);
  });
});

describe('useMilestoneDisputes', () => {
  it("loads the wallet's disputes", async () => {
    const { result } = renderDisputes();

    await waitFor(() => expect(result.current.disputes).toEqual([DISPUTE]));
    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch without a wallet', async () => {
    const { result } = renderDisputes(null);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.disputes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces fetch errors', async () => {
    mockFetch.mockRejectedValue(new Error('Disputes unavailable'));
    const { result } = renderDisputes();

    await waitFor(() =>
      expect(result.current.error).toBe('Disputes unavailable'),
    );
    expect(result.current.disputes).toEqual([]);
  });

  it('findByMilestoneId returns the matching dispute', async () => {
    const { result } = renderDisputes();
    await waitFor(() => expect(result.current.disputes).toHaveLength(1));

    expect(result.current.findByMilestoneId('milestone-1')).toEqual(DISPUTE);
    expect(result.current.findByMilestoneId('unknown')).toBeUndefined();
  });

  it('file() creates a dispute and prepends it to the cache', async () => {
    const created = dispute(2, 'milestone-2');
    mockCreate.mockResolvedValue(created);
    const { result } = renderDisputes();
    await waitFor(() => expect(result.current.disputes).toHaveLength(1));

    const params = {
      playerId: 'player-1',
      milestoneId: 'milestone-2',
      milestoneDescription: 'Milestone milestone-2',
      reason: 'Evidence was fabricated',
    };
    let returned: MilestoneDispute | undefined;
    await act(async () => {
      returned = await result.current.file(params);
    });

    expect(mockCreate).toHaveBeenCalledWith(params);
    expect(returned).toEqual(created);
    expect(result.current.disputes.map((d) => d.id)).toEqual([2, 1]);
  });
});
