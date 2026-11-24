'use client';

import { useEffect, useState } from 'react';
import type { ConfigWarning } from '@/lib/config';
import { CONFIG_WARNING_DISMISSED_KEY } from '@/lib/storageKeys';

const SESSION_KEY = CONFIG_WARNING_DISMISSED_KEY;

interface ConfigWarningBannerProps {
  warnings: ConfigWarning[];
}

/**
 * Displays a dismissible banner at the top of the page when critical
 * environment variables are missing or misconfigured.
 *
 * The banner is dismissed for the current browser tab session so a user
 * who has seen the warning isn't nagged on every navigation.
 */
export default function ConfigWarningBanner({
  warnings,
}: ConfigWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (warnings.length === 0) {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {}
      setDismissed(false);
      return;
    }
    try {
      const val = sessionStorage.getItem(SESSION_KEY);
      setDismissed(val === '1');
    } catch {
      setDismissed(false);
    }
  }, [warnings]);

  function handleDismiss() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {}
    setDismissed(true);
  }

  if (warnings.length === 0 || dismissed) {
    return null;
  }

  const hasErrors = warnings.some((w) => w.severity === 'error');

  return (
    <div
      role="alert"
      className={
        hasErrors
          ? 'w-full bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-50 border-b border-red-500'
          : 'w-full bg-yellow-300 text-black px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-50 border-b border-yellow-400'
      }
    >
      <div className="text-sm leading-relaxed">
        <strong className="font-semibold">
          {hasErrors ? '⚠️ Configuration Error' : '⚠️ Configuration Warning'}
        </strong>
        <ul className="mt-1 space-y-0.5">
          {warnings.map((w) => (
            <li key={w.key}>
              <code className="bg-black/10 px-1 py-0.5 rounded text-xs font-mono">
                {w.key}
              </code>
              : {w.message}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={handleDismiss}
        className={`shrink-0 px-3 py-1 rounded-md text-xs font-semibold ${
          hasErrors
            ? 'bg-white text-red-600 hover:bg-red-50'
            : 'bg-black text-yellow-300 hover:bg-gray-800'
        }`}
      >
        Dismiss
      </button>
    </div>
  );
}
