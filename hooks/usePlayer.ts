'use client';
import { useState, useEffect } from 'react';
import { getPlayer } from '@/lib/contract';
import type { Player } from '@/types';

export function usePlayer(walletOrId: string | null) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletOrId) return;
    setLoading(true);
    setError(null);
    getPlayer(walletOrId)
      .then(setPlayer)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [walletOrId]);

  return { player, loading, error };
}
