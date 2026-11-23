import { useState, useCallback } from 'react';
import {
  linkBackupWallet,
  removeBackupWallet,
  claimAccountWithBackupWallet,
} from '@/lib/api';

export function useBackupWallet() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = useCallback(
    async (playerId: string, backupWallet: string, signature: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await linkBackupWallet(
          playerId,
          backupWallet,
          signature,
        );
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to link backup wallet';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const remove = useCallback(async (playerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await removeBackupWallet(playerId);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to remove backup wallet';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const claim = useCallback(
    async (primaryWallet: string, backupWallet: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await claimAccountWithBackupWallet(
          primaryWallet,
          backupWallet,
        );
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to recover account';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { link, remove, claim, loading, error };
}
