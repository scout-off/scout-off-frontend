'use client';

import { useEffect, useRef } from 'react';

export interface UseVisibilityIntervalOptions {
  runOnVisible?: boolean;
}

export function useVisibilityInterval(
  callback: () => void | Promise<void>,
  ms: number,
  { runOnVisible = false }: UseVisibilityIntervalOptions = {},
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const isVisible = () => document.visibilityState !== 'hidden';
    const tick = () => {
      void callbackRef.current();
    };

    let intervalId: number | undefined;

    const clear = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const start = () => {
      if (!isVisible()) return;
      intervalId = window.setInterval(() => {
        if (isVisible()) {
          void callbackRef.current();
        }
      }, ms);
    };

    if (isVisible()) {
      if (runOnVisible) {
        tick();
      }
      start();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clear();
        return;
      }

      if (runOnVisible) {
        tick();
      }
      if (intervalId === undefined) {
        start();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clear();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ms, runOnVisible]);
}
