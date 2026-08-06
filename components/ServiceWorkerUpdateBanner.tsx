'use client';

import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';

/**
 * Prompts the user to reload once a new service worker build is waiting to
 * activate. Dismissing just hides the prompt — it doesn't block the app, and
 * the new version still takes over on the next full page load.
 */
export default function ServiceWorkerUpdateBanner() {
  const { updateAvailable, reload, dismiss } = useServiceWorkerUpdate();

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-sky-500 text-white px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-50 border-b border-sky-600"
    >
      <span className="text-sm">
        <strong className="font-semibold">New version available.</strong> Reload
        to get the latest updates.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={reload}
          className="bg-white text-sky-600 px-3 py-1 rounded-md text-sm font-semibold hover:bg-sky-50"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update banner"
          className="bg-sky-600 text-white px-3 py-1 rounded-md text-sm font-medium hover:bg-sky-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
