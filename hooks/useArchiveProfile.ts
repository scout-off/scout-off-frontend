import { useState, useCallback } from 'react';
import { archivePlayerProfile, unarchivePlayerProfile } from '@/lib/api';

export function useArchiveProfile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = useCallback(async (playerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await archivePlayerProfile(playerId);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to archive profile';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const unarchive = useCallback(async (playerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await unarchivePlayerProfile(playerId);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to unarchive profile';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { archive, unarchive, loading, error };
}
