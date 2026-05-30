"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { filterPlayers } from "@/lib/contract";
import type { Player, PlayerFilter } from "@/types";

export function useScout(initialFilter: PlayerFilter = {}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlayerFilter>(initialFilter);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIdRef = useRef(0);

  const search = useCallback(async (currentFilter: PlayerFilter) => {
    const id = ++searchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const results = await filterPlayers(
        currentFilter.region ?? "",
        currentFilter.position ?? "",
        currentFilter.minLevel ?? 0
      );
      if (id === searchIdRef.current) {
        setPlayers(results as Player[]);
      }
    } catch (e: any) {
      if (id === searchIdRef.current) {
        setError(e.message);
        setPlayers([]);
      }
    } finally {
      if (id === searchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced search when filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(filter);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filter, search]);

  return { 
    players, 
    loading, 
    error, 
    filter, 
    setFilter,
    search // Expose manual search function too
  };
}
