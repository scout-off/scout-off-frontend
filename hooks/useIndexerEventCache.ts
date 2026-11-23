'use client';
import useSWR from 'swr';
import {
  fetchEvents,
  type IndexedEvent,
  type IndexedEventType,
} from '@/lib/indexerClient';

const MAX_PAGES = 10;
const PAGE_SIZE = 200;
/** Max total events to hold in the shared cache (memory bound). */
export const CACHE_MAX_EVENTS = 2000;
/** Shared SWR dedup/revalidation interval — 30 s, matching the most-frequent hook (useFeeRevenue). */
export const CACHE_DEDUP_INTERVAL_MS = 30_000;

// SWR key for the shared cache
export const INDEXER_CACHE_KEY = 'indexer:events:shared';

async function fetchAllEvents(): Promise<IndexedEvent[]> {
  const all: IndexedEvent[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, nextCursor } = await fetchEvents({
      limit: PAGE_SIZE,
      before: cursor,
    });
    all.push(...events);
    if (nextCursor === null || events.length === 0) break;
    cursor = nextCursor;
  }
  // Apply memory bound: keep only the most-recent CACHE_MAX_EVENTS events
  return all.length > CACHE_MAX_EVENTS ? all.slice(0, CACHE_MAX_EVENTS) : all;
}

export interface UseIndexerEventCacheResult {
  events: IndexedEvent[];
  loading: boolean;
  error: string | null;
}

/**
 * Shared SWR-backed cache for all indexer events.
 * Multiple hooks mounting this simultaneously will share a single fetch
 * (SWR deduplicates on the same key). Each consumer filters the shared
 * events for its own event types client-side.
 *
 * Cache invalidation: 30 s deduping interval (matches useFeeRevenue's
 * interval — the most-frequent consumer). A new event fetched by the
 * shared cache becomes visible to ALL consumers within 30 s.
 *
 * Memory bound: CACHE_MAX_EVENTS (2000) events max; oldest are dropped
 * when the limit is exceeded on a refresh.
 */
export function useIndexerEventCache(): UseIndexerEventCacheResult {
  const { data, error, isValidating } = useSWR<IndexedEvent[]>(
    INDEXER_CACHE_KEY,
    fetchAllEvents,
    {
      dedupingInterval: CACHE_DEDUP_INTERVAL_MS,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );
  return {
    events: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
  };
}

// Re-export the type so consumers can import it alongside the hook without
// needing a separate import from indexerClient.
export type { IndexedEventType };
