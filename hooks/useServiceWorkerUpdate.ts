'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** The subset of @serwist/window's `Serwist` this hook uses. */
interface SerwistLike {
  addEventListener: (
    type: 'waiting' | 'controlling',
    listener: () => void,
  ) => void;
  removeEventListener: (
    type: 'waiting' | 'controlling',
    listener: () => void,
  ) => void;
  messageSkipWaiting: () => void;
}

declare global {
  interface Window {
    serwist?: SerwistLike;
  }
}

interface UseServiceWorkerUpdateResult {
  updateAvailable: boolean;
  reload: () => void;
  dismiss: () => void;
}

/**
 * Surfaces Serwist's `window.serwist` (@serwist/window, injected by
 * @serwist/next) lifecycle events so the UI can prompt the user to reload
 * once a new service worker is waiting to activate. Relies on
 * `skipWaiting: false` in worker/sw.ts — otherwise
 * every update activates silently and never reaches the "waiting" state.
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const reloadRequested = useRef(false);

  useEffect(() => {
    const serwist = window.serwist;
    if (!serwist) return;

    const handleWaiting = () => setUpdateAvailable(true);
    const handleControlling = () => {
      if (reloadRequested.current) {
        window.location.reload();
      }
    };

    serwist.addEventListener('waiting', handleWaiting);
    serwist.addEventListener('controlling', handleControlling);

    return () => {
      serwist.removeEventListener('waiting', handleWaiting);
      serwist.removeEventListener('controlling', handleControlling);
    };
  }, []);

  const reload = useCallback(() => {
    const serwist = window.serwist;
    if (!serwist) return;
    reloadRequested.current = true;
    serwist.messageSkipWaiting();
  }, []);

  const dismiss = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, reload, dismiss };
}
