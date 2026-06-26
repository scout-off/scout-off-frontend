import { renderHook, act } from '@testing-library/react';

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
import { useValidator, invalidateValidatorCache } from '@/hooks/useValidator';

const mockUseWallet = useWallet as jest.Mock;
const mockGetValidators = getValidators as jest.Mock;
const mockBuildApproveMilestone = buildApproveMilestone as jest.Mock;
const mockBuildRevokeMilestone = buildRevokeMilestone as jest.Mock;

const VALIDATOR_KEY = 'GVALIDATOR7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU';
const PLAYER_ID = 'player-1';

beforeEach(() => {
  jest.resetAllMocks();
  invalidateValidatorCache();
  mockGetValidators.mockResolvedValue([
    { address: VALIDATOR_KEY, addedAt: 0 },
  ]);
});

describe('useValidator — approve_milestone', () => {
  test('happy path: builds the approve_milestone xdr and clears loading/error', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: VALIDATOR_KEY,
      signAndSubmit: jest.fn(),
    });
    mockBuildApproveMilestone.mockResolvedValue('APPROVE_XDR');

    const { result } = renderHook(() => useValidator());

    await act(async () => {
      await Promise.resolve();
    });

    let xdr: string | undefined;
    await act(async () => {
      xdr = await result.current.approveMilestone(
        PLAYER_ID,
        'Signed professional contract',
      );
    });

    expect(mockBuildApproveMilestone).toHaveBeenCalledWith(
      VALIDATOR_KEY,
      PLAYER_ID,
      'Signed professional contract',
    );
    expect(xdr).toBe('APPROVE_XDR');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('useValidator — revoke_milestone', () => {
  test('happy path: builds the revoke_milestone xdr, signs it, and returns the updated player', async () => {
    const mockSignAndSubmit = jest
      .fn()
      .mockResolvedValue({ id: PLAYER_ID, progressLevel: 1 });
    mockUseWallet.mockReturnValue({
      publicKey: VALIDATOR_KEY,
      signAndSubmit: mockSignAndSubmit,
    });
    mockBuildRevokeMilestone.mockResolvedValue('REVOKE_XDR');

    const { result } = renderHook(() => useValidator());

    await act(async () => {
      await Promise.resolve();
    });

    let player: unknown;
    await act(async () => {
      player = await result.current.revokeMilestone(PLAYER_ID, 'milestone-1');
    });

    expect(mockBuildRevokeMilestone).toHaveBeenCalledWith(
      VALIDATOR_KEY,
      PLAYER_ID,
      'milestone-1',
    );
    expect(mockSignAndSubmit).toHaveBeenCalledWith('REVOKE_XDR');
    expect(player).toEqual({ id: PLAYER_ID, progressLevel: 1 });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
