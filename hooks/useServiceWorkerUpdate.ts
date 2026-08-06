'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface WorkboxLike {
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
    workbox?: WorkboxLike;
  }
}

interface UseServiceWorkerUpdateResult {
  updateAvailable: boolean;
  reload: () => void;
  dismiss: () => void;
}

/**
 * Surfaces next-pwa's `window.workbox` (workbox-window) lifecycle events so
 * the UI can prompt the user to reload once a new service worker is waiting
 * to activate. Relies on `skipWaiting: false` in next.config.js — otherwise
 * every update activates silently and never reaches the "waiting" state.
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const reloadRequested = useRef(false);

  useEffect(() => {
    const workbox = window.workbox;
    if (!workbox) return;

    const handleWaiting = () => setUpdateAvailable(true);
    const handleControlling = () => {
      if (reloadRequested.current) {
        window.location.reload();
      }
    };

    workbox.addEventListener('waiting', handleWaiting);
    workbox.addEventListener('controlling', handleControlling);

    return () => {
      workbox.removeEventListener('waiting', handleWaiting);
      workbox.removeEventListener('controlling', handleControlling);
    };
  }, []);

  const reload = useCallback(() => {
    const workbox = window.workbox;
    if (!workbox) return;
    reloadRequested.current = true;
    workbox.messageSkipWaiting();
  }, []);

  const dismiss = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, reload, dismiss };
}
