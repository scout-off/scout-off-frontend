'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  fetchRecentlyViewed,
  recordView,
  removeView,
} from '@/lib/recentlyViewedClient';
import { useWallet } from '@/hooks/useWallet';
import type { RecentlyViewedEntry } from '@/types';

const STORAGE_KEY = 'scoutoff_recently_viewed';
const MAX_ENTRIES = 10;

function getStoredEntries(): RecentlyViewedEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // localStorage unavailable or corrupt value — start fresh
    return [];
  }
}

function setStoredEntries(entries: RecentlyViewedEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Silently ignore storage errors (private browsing, quota, etc.)
  }
}

/**
 * Tracks the scout's recently-viewed player profiles. For authenticated
 * scouts, uses server-side SQLite storage (via /api/recently-viewed) so
 * the list persists across devices. For anonymous sessions, falls back to
 * localStorage-only behavior.
 *
 * The server store caps entries at 50 per scout; localStorage uses its own MAX_ENTRIES (10).
 */
export function useRecentlyViewed() {
  const { publicKey } = useWallet();
  const isAuthenticated = Boolean(publicKey);

  // Local state for anonymous mode (localStorage-backed)
  const [localEntries, setLocalEntries] = useState<RecentlyViewedEntry[]>(
    getStoredEntries,
  );

  // SWR data for authenticated mode (server-backed)
  const { data: serverEntries, mutate: mutateServer } = useSWR<
    RecentlyViewedEntry[]
  >(isAuthenticated ? `recently-viewed:${publicKey}` : null, fetchRecentlyViewed, {
    dedupingInterval: 5_000,
    revalidateOnFocus: false,
    errorRetryCount: 2,
  });

  // Sync server entries to local state when switching from authenticated to anonymous
  useEffect(() => {
    if (!isAuthenticated && serverEntries) {
      setLocalEntries(serverEntries);
    }
  }, [isAuthenticated, serverEntries]);

  // Get current effective entries list
  const effectiveEntries = isAuthenticated ? (serverEntries ?? []) : localEntries;

  const record = useCallback(
    async (entryData: Omit<RecentlyViewedEntry, 'viewedAt'>) => {
      const entry: RecentlyViewedEntry = {
        ...entryData,
        viewedAt: Date.now(),
      };

      if (isAuthenticated) {
        try {
          await recordView(entry.playerId, entry.viewedAt);
          mutateServer();
        } catch {
          // If server recording fails, fall back to localStorage
          setLocalEntries((prev) => {
            const filtered = prev.filter((e) => e.playerId !== entry.playerId);
            const next = [{ ...entry }, ...filtered].slice(0, MAX_ENTRIES);
            setStoredEntries(next);
            return next;
          });
        }
      } else {
        setLocalEntries((prev) => {
          const filtered = prev.filter((e) => e.playerId !== entry.playerId);
          const next = [{ ...entry }, ...filtered].slice(0, MAX_ENTRIES);
          setStoredEntries(next);
          return next;
        });
      }
    },
    [isAuthenticated, mutateServer],
  );

  const remove = useCallback(
    async (entry: RecentlyViewedEntry) => {
      if (isAuthenticated) {
        try {
          await removeView(entry.id);
          mutateServer();
        } catch {
          // If removal fails, still remove from local cache
          setLocalEntries((prev) =>
            prev.filter((e) => e.playerId !== entry.playerId),
          );
        }
      } else {
        setLocalEntries((prev) =>
          prev.filter((e) => e.playerId !== entry.playerId),
        );
      }
    },
    [isAuthenticated, mutateServer],
  );

  return {
    entries: effectiveEntries,
    record,
    remove,
  };
}
