'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  isLoading: boolean;
  children: React.ReactNode;
}

export default function PullToRefresh({
  onRefresh,
  isLoading,
  children,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshState, setRefreshState] = useState<
    'idle' | 'pulling' | 'ready' | 'refreshing'
  >('idle');
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isPulling = useRef(false);

  const threshold = 70; // Drag threshold in px
  const maxPull = 120; // Max drag visual offset in px

  // Keep refs up-to-date to avoid re-binding event listeners
  const isLoadingRef = useRef(isLoading);
  const refreshStateRef = useRef(refreshState);
  const pullDistanceRef = useRef(pullDistance);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    refreshStateRef.current = refreshState;
  }, [refreshState]);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Sync internal state when external isLoading changes
  useEffect(() => {
    if (isLoading) {
      setRefreshState('refreshing');
      setPullDistance(threshold);
    } else {
      setRefreshState('idle');
      setPullDistance(0);
    }
  }, [isLoading]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only initiate gesture if we are at the very top of the window scroll area
      const isAtTop =
        window.scrollY === 0 || document.documentElement.scrollTop === 0;
      if (isAtTop && !isLoadingRef.current) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
        setIsDragging(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY.current;

      if (deltaY > 0) {
        // Apply resistance (damping factor of 0.4)
        const dampedDistance = Math.min(deltaY * 0.4, maxPull);
        setPullDistance(dampedDistance);

        if (dampedDistance >= threshold) {
          setRefreshState('ready');
        } else {
          setRefreshState('pulling');
        }

        // Prevent native browser overscroll/refresh behavior (Chrome/Safari)
        if (e.cancelable) {
          e.preventDefault();
        }
      } else {
        // User dragged back up beyond start point
        setPullDistance(0);
        setRefreshState('idle');
        isPulling.current = false;
        setIsDragging(false);
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      setIsDragging(false);

      if (pullDistanceRef.current >= threshold) {
        setRefreshState('refreshing');
        setPullDistance(threshold);
        // Invoke the refresh callback
        const result = onRefreshRef.current();
        if (result && typeof result.then === 'function') {
          result
            .catch(() => {})
            .finally(() => {
              if (refreshStateRef.current === 'refreshing') {
                setRefreshState('idle');
                setPullDistance(0);
              }
            });
        }
      } else {
        setRefreshState('idle');
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    container.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div ref={containerRef} className="relative w-full overflow-x-hidden">
      {/* Pull Indicator */}
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-40"
        style={{
          transform: `translateY(${pullDistance - 50}px)`,
          opacity: pullDistance > 10 ? 1 : 0,
          transition: isDragging
            ? 'none'
            : 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 300ms ease-out',
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-card border border-gray-300 dark:border-gray-800 shadow-2xl text-brand-green">
          {refreshState === 'refreshing' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowDown
              className="h-5 w-5"
              style={{
                transform: `rotate(${refreshState === 'ready' ? 180 : 0}deg) scale(${0.5 + progress * 0.5})`,
                transition: 'transform 200ms ease-out',
              }}
            />
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          transform:
            refreshState === 'refreshing'
              ? 'none'
              : `translateY(${pullDistance * 0.25}px)`,
          transition: isDragging
            ? 'none'
            : 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
