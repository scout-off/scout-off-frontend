'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight windowing wrapper for large player result sets.
 *
 * Renders only the rows near the viewport instead of the entire filtered
 * list, avoiding the slow initial render / janky scroll seen with hundreds
 * of player cards. No external dependency required — swap in for a direct
 * `.map()` render wherever the full player grid is mounted.
 */
export function useVirtualizedRows<T>({
  items,
  rowHeight,
  overscan = 5,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    el.addEventListener('scroll', onScroll);

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  return {
    containerRef,
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * rowHeight,
    bottomSpacerHeight: Math.max(0, (items.length - endIndex) * rowHeight),
    totalHeight: items.length * rowHeight,
  };
}
