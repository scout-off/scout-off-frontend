import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchApprovedPlayerEvents } from '../lib/indexerClient';

const PAGE_SIZE = 200;

/**
 * Incrementally loads approved-player events from the indexer.
 *
 * Previously this hook eagerly looped up to MAX_PAGES (10) pages and silently
 * dropped everything beyond 2,000 events. It now loads one page at a time and
 * exposes `hasMore` / `loadMore` so callers can surface
 * "Showing N of at least M — load more" instead of truncating silently.
 */
export function useApprovedPlayers() {
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Dedupe across pages: the indexer can return the same player more than once
  // (e.g. re-approvals), and page boundaries may overlap.
  const seenIds = useRef<Set<string>>(new Set());

  const loadPage = useCallback(async (nextCursor: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await fetchApprovedPlayerEvents({
        limit: PAGE_SIZE,
        cursor: nextCursor ?? undefined,
      });

      const fresh: string[] = [];
      for (const event of page.items) {
        const id = event.playerId;
        if (!id || seenIds.current.has(id)) continue;
        seenIds.current.add(id);
        fresh.push(id);
      }

      if (fresh.length > 0) {
        setPlayerIds((prev) => [...prev, ...fresh]);
      }
      setCursor(page.nextCursor ?? null);
      setHasMore(Boolean(page.nextCursor));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    void loadPage(cursor);
  }, [cursor, hasMore, isLoading, loadPage]);

  const players = useMemo(() => playerIds, [playerIds]);

  return {
    players,
    playerIds: players,
    count: players.length,
    hasMore,
    isLoading,
    error,
    loadMore,
  };
}

export default useApprovedPlayers;
