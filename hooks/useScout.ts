'use client';
import { useState } from 'react';
import { filterPlayers } from '@/lib/contract';
import type { Player, PlayerFilter } from '@/types';

export function useScout() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(filter: PlayerFilter) {
    setLoading(true);
    setError(null);
    try {
      const results = await filterPlayers(
        filter.region ?? '',
        filter.position ?? '',
        filter.minLevel ?? 0,
      );
      setPlayers(results as Player[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { players, loading, error, search };
}
