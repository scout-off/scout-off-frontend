import { renderHook, act } from '@testing-library/react';
import { useBackupWallet } from '@/hooks/useBackupWallet';
import type { Player } from '@/types';

const mockLinkBackupWallet = jest.fn();
const mockRemoveBackupWallet = jest.fn();
const mockClaimAccountWithBackupWallet = jest.fn();

jest.mock('@/lib/api', () => ({
  linkBackupWallet: (...args: unknown[]) => mockLinkBackupWallet(...args),
  removeBackupWallet: (...args: unknown[]) => mockRemoveBackupWallet(...args),
  claimAccountWithBackupWallet: (...args: unknown[]) =>
    mockClaimAccountWithBackupWallet(...args),
}));

const PLAYER: Player = {
  id: 'p1',
  wallet: 'G'.padEnd(56, 'X'),
  vitals: { name: 'P1', position: 'forward', region: 'EU', age: 18 },
  progressLevel: 0,
  archived: false,
  milestones: [],
  stats: {},
  ipfsHash: '',
} as unknown as Player;

describe('useBackupWallet', () => {
  beforeEach(() => {
    mockLinkBackupWallet.mockReset();
    mockRemoveBackupWallet.mockReset();
    mockClaimAccountWithBackupWallet.mockReset();
  });

  it('starts with loading false and error null', () => {
    const { result } = renderHook(() => useBackupWallet());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  describe('link()', () => {
    it('resolves with the updated player on success', async () => {
      mockLinkBackupWallet.mockResolvedValueOnce(PLAYER);
      const { result } = renderHook(() => useBackupWallet());

      let out: unknown;
      await act(async () => {
        out = await result.current.link('p1', 'GBACKUP', 'sig');
      });

      expect(out).toEqual(PLAYER);
      expect(mockLinkBackupWallet).toHaveBeenCalledWith('p1', 'GBACKUP', 'sig');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets loading true while in flight and false after resolving', async () => {
      let resolve!: (v: Player) => void;
      mockLinkBackupWallet.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const { result } = renderHook(() => useBackupWallet());

      let promise: Promise<unknown>;
      act(() => {
        promise = result.current.link('p1', 'GBACKUP', 'sig');
      });
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolve(PLAYER);
        await promise;
      });
      expect(result.current.loading).toBe(false);
    });

    it('sets error and rethrows on failure with an Error instance', async () => {
      mockLinkBackupWallet.mockRejectedValueOnce(new Error('link failed'));
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(
          result.current.link('p1', 'GBACKUP', 'sig'),
        ).rejects.toThrow('link failed');
      });

      expect(result.current.error).toBe('link failed');
      expect(result.current.loading).toBe(false);
    });

    it('falls back to a default message when the thrown value is not an Error', async () => {
      mockLinkBackupWallet.mockRejectedValueOnce('boom');
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(result.current.link('p1', 'GBACKUP', 'sig')).rejects.toBe(
          'boom',
        );
      });

      expect(result.current.error).toBe('Failed to link backup wallet');
    });

    it('clears a previous error on a new call', async () => {
      mockLinkBackupWallet.mockRejectedValueOnce(new Error('first error'));
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(
          result.current.link('p1', 'GBACKUP', 'sig'),
        ).rejects.toThrow();
      });
      expect(result.current.error).toBe('first error');

      mockLinkBackupWallet.mockResolvedValueOnce(PLAYER);
      await act(async () => {
        await result.current.link('p1', 'GBACKUP', 'sig');
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe('remove()', () => {
    it('resolves with the updated player on success', async () => {
      mockRemoveBackupWallet.mockResolvedValueOnce(PLAYER);
      const { result } = renderHook(() => useBackupWallet());

      let out: unknown;
      await act(async () => {
        out = await result.current.remove('p1');
      });

      expect(out).toEqual(PLAYER);
      expect(mockRemoveBackupWallet).toHaveBeenCalledWith('p1');
      expect(result.current.error).toBeNull();
    });

    it('sets error and rethrows on failure', async () => {
      mockRemoveBackupWallet.mockRejectedValueOnce(new Error('remove failed'));
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(result.current.remove('p1')).rejects.toThrow(
          'remove failed',
        );
      });

      expect(result.current.error).toBe('remove failed');
    });

    it('falls back to a default message when the thrown value is not an Error', async () => {
      mockRemoveBackupWallet.mockRejectedValueOnce('boom');
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(result.current.remove('p1')).rejects.toBe('boom');
      });

      expect(result.current.error).toBe('Failed to remove backup wallet');
    });
  });

  describe('claim()', () => {
    it('resolves with the recovered account on success', async () => {
      const recovered = { playerId: 'p1', wallet: 'GNEW' };
      mockClaimAccountWithBackupWallet.mockResolvedValueOnce(recovered);
      const { result } = renderHook(() => useBackupWallet());

      let out: unknown;
      await act(async () => {
        out = await result.current.claim('GPRIMARY', 'GBACKUP');
      });

      expect(out).toEqual(recovered);
      expect(mockClaimAccountWithBackupWallet).toHaveBeenCalledWith(
        'GPRIMARY',
        'GBACKUP',
      );
      expect(result.current.error).toBeNull();
    });

    it('sets error and rethrows on failure', async () => {
      mockClaimAccountWithBackupWallet.mockRejectedValueOnce(
        new Error('claim failed'),
      );
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(
          result.current.claim('GPRIMARY', 'GBACKUP'),
        ).rejects.toThrow('claim failed');
      });

      expect(result.current.error).toBe('claim failed');
    });

    it('falls back to a default message when the thrown value is not an Error', async () => {
      mockClaimAccountWithBackupWallet.mockRejectedValueOnce('boom');
      const { result } = renderHook(() => useBackupWallet());

      await act(async () => {
        await expect(result.current.claim('GPRIMARY', 'GBACKUP')).rejects.toBe(
          'boom',
        );
      });

      expect(result.current.error).toBe('Failed to recover account');
    });
  });
});
