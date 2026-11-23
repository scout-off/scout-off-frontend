'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Performs a lightweight connectivity check by fetching a small resource.
 * navigator.onLine alone can be unreliable (e.g. connected to Wi-Fi but no internet).
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/auth/session', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok || res.status === 401; // 401 = connected but not authenticated
  } catch {
    return false;
  }
}

export default function OfflineBanner() {
  const t = useTranslations('offline');
  const [isOffline, setIsOffline] = useState(false);

  const verifyConnectivity = useCallback(async () => {
    // Quick check: if browser says offline, trust it immediately
    if (!navigator.onLine) {
      setIsOffline(true);
      return;
    }
    // Double-check with a real request
    const online = await checkConnectivity();
    setIsOffline(!online);
  }, []);

  useEffect(() => {
    // Initial check
    verifyConnectivity();

    function handleOnline() {
      verifyConnectivity();
    }
    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic connectivity check every 30 seconds
    const interval = setInterval(verifyConnectivity, 30_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [verifyConnectivity]);

  if (!isOffline) return null;

  return (
    <div
      aria-live="polite"
      role="status"
      className="w-full bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium sticky top-0 z-40"
    >
      <span aria-hidden="true" className="text-base">
        ⚠
      </span>
      <span>{t('bannerMessage')}</span>
    </div>
  );
}
