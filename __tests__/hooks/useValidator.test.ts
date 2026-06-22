'use client';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useValidator, invalidateValidatorCache } from '@/hooks/useValidator';
import type { Player, ValidatorInfo } from '@/types';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  getValidators: jest.fn(),
  buildApproveMilestone: jest.fn(),
  buildRevokeMilestone: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import {
  getValidators,
  buildApproveMilestone,
  buildRevokeMilestone,
} from '@/lib/contract';

const mockUseWallet = useWallet as jest.Mock;
const mockGetValidators = getValidators as jest.Mock;
const mockBuildApproveMilestone = buildApproveMilestone as jest.Mock;
const mockBuildRevokeMilestone = buildRevokeMilestone as jest.Mock;

const VALIDATOR_KEY = 'GVALIDATOR1234567890ABCDEFGHIJKLMNOP';
const MOCK_XDR = 'AAAA...XDR...';

const mockValidators: ValidatorInfo[] = [
  { address: VALIDATOR_KEY, addedAt: 1_000_000, addedBy: 'GADMIN' },
];

const mockPlayer: Player = {
  id: 'player-1',
  wallet: 'GABC123',
  vitals: {
    name: 'Charlie',
    age: 20,
    position: 'GK',
    region: 'SA',
    nationality: 'BR',
  },
  ipfsHash: 'QmPlayerHash',
  progressLevel: 1,
  milestones: [],
  createdAt: 1_500_000,
};

describe('useValidator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    invalidateValidatorCache();
    mockUseWallet.mockReturnValue({
      publicKey: VALIDATOR_KEY,
      signAndSubmit: jest.fn(),
    });
    mockGetValidators.mockResolvedValue(mockValidators);
  });

  test('approve_milestone happy path returns XDR string', async () => {
    mockBuildApproveMilestone.mockResolvedValue(MOCK_XDR);

    const { result } = renderHook(() => useValidator());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let xdr: string | undefined;
    await act(async () => {
      xdr = await result.current.approveMilestone('player-1', 'milestone-1');
    });

    expect(mockBuildApproveMilestone).toHaveBeenCalledWith(
      VALIDATOR_KEY,
      'player-1',
      'milestone-1',
    );
    expect(xdr).toBe(MOCK_XDR);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('revoke_milestone happy path signs and returns Player', async () => {
    const mockSignAndSubmit = jest.fn().mockResolvedValue(mockPlayer);
    mockUseWallet.mockReturnValue({
      publicKey: VALIDATOR_KEY,
      signAndSubmit: mockSignAndSubmit,
    });
    mockBuildRevokeMilestone.mockResolvedValue(MOCK_XDR);

    const { result } = renderHook(() => useValidator());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let player: Player | undefined;
    await act(async () => {
      player = await result.current.revokeMilestone('player-1', 'milestone-1');
    });

    expect(mockBuildRevokeMilestone).toHaveBeenCalledWith(
      VALIDATOR_KEY,
      'player-1',
      'milestone-1',
    );
    expect(mockSignAndSubmit).toHaveBeenCalledWith(MOCK_XDR);
    expect(player).toEqual(mockPlayer);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
