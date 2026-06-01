'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { getMilestoneHistory } from '@/lib/contract';
import type { Milestone } from '@/types';

export function useMilestoneHistory(playerID: string | null) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Record<string, Milestone[]>>({});

  const fetch = useCallback(async (id: string, bust = false) => {
    if (!bust && cache.current[id]) {
      setMilestones(cache.current[id]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = (await getMilestoneHistory(id)) as Milestone[] | null;
      const data = result ?? [];
      cache.current[id] = data;
      setMilestones(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (playerID) fetch(playerID);
  }, [playerID, fetch]);

  const refetch = useCallback(() => {
    if (playerID) {
      delete cache.current[playerID];
      fetch(playerID, true);
    }
  }, [playerID, fetch]);

  return { milestones, loading, error, refetch };
}
