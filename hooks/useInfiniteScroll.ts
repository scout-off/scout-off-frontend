'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInfiniteScrollOptions {
  /** Total items available (the full filtered list). */
  items: unknown[];
  /** How many items to show per "page" / load batch. Default: 12. */
  pageSize?: number;
  /**
   * How many pixels from the bottom of the scroll sentinel to trigger the
   * next load. Default: 200.
   */
  threshold?: number;
}

export interface UseInfiniteScrollResult<T> {
  /** The currently visible slice of items. */
  visibleItems: T[];
  /** True while the brief simulated "loading next batch" tick is running. */
  isFetchingMore: boolean;
  /** True when all items are already visible — no more to load. */
  isExhausted: boolean;
  /** Ref to attach to the sentinel element at the bottom of the list. */
  sentinelRef: React.RefObject<HTMLDivElement>;
  /**
   * Jump directly to page `n` (1-indexed). Used by the keyboard-accessible
   * pagination fallback so keyboard users are never forced to scroll.
   */
  goToPage: (page: number) => void;
  /** Current logical page number (1-indexed). */
  currentPage: number;
  /** Total number of pages. */
  totalPages: number;
}

/**
 * useInfiniteScroll
 *
 * Manages a progressively-revealed slice of a pre-fetched array.  All data
 * is already in memory (the contract returns the full filtered list); this
 * hook only controls *how much* is rendered at a time.
 *
 * - Attaches an IntersectionObserver to a sentinel <div> ref.
 * - When the sentinel enters the viewport, the visible count grows by pageSize.
 * - Resets automatically when `items` identity changes (new search / filter).
 * - Exposes `goToPage` so the pagination fallback can jump ahead without
 *   scrolling.
 */
export function useInfiniteScroll<T>({
  items,
  pageSize = 12,
  threshold = 200,
}: UseInfiniteScrollOptions): UseInfiniteScrollResult<T> {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Stable ref to avoid stale closure inside the IntersectionObserver callback.
  const isFetchingMoreRef = useRef(false);

  const totalItems = items.length;
  const isExhausted = visibleCount >= totalItems;
  const visibleItems = (items as T[]).slice(0, visibleCount);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.ceil(visibleCount / pageSize), totalPages);

  // Reset when the source list changes (new search result).
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const loadMore = useCallback(() => {
    if (isFetchingMoreRef.current || visibleCount >= totalItems) return;

    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);

    // A single rAF tick is enough — data is already in memory.
    // The brief flash of the spinner communicates that something happened.
    requestAnimationFrame(() => {
      setVisibleCount((prev) => Math.min(prev + pageSize, totalItems));
      setIsFetchingMore(false);
      isFetchingMoreRef.current = false;
    });
  }, [visibleCount, totalItems, pageSize]);

  // Wire up the IntersectionObserver on the sentinel element.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      {
        // rootMargin expands the detection zone `threshold` px below the viewport.
        rootMargin: `0px 0px ${threshold}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, threshold]);

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      setVisibleCount(clamped * pageSize);
    },
    [totalPages, pageSize],
  );

  return {
    visibleItems,
    isFetchingMore,
    isExhausted,
    sentinelRef,
    goToPage,
    currentPage,
    totalPages,
  };
}
