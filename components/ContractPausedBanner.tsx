'use client';

import { useEffect, useState } from 'react';
import useIsPaused from '@/hooks/useIsPaused';

const SESSION_KEY = 'scoutoff:contractPausedDismissed';
const SUPPORT_URL = 'https://discord.gg/stellar';

export default function ContractPausedBanner() {
  const paused = useIsPaused();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const val = sessionStorage.getItem(SESSION_KEY);
      setDismissed(val === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!paused) {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {}
      setDismissed(false);
    }
  }, [paused]);

  function handleDismiss() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {}
    setDismissed(true);
  }

  const visible = paused && !dismissed;

  return (
    <div aria-live="polite" style={{ minHeight: visible ? undefined : 0 }}>
      {visible && (
        <div className="w-full bg-yellow-300 text-black px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-40 border-b border-yellow-400">
          <div>
            <strong className="font-semibold">
              ScoutOff is currently under maintenance.
            </strong>{' '}
            <span className="text-sm">
              Transactions are disabled.{' '}
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Get updates on Discord
              </a>
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 bg-black text-yellow-300 px-3 py-1 rounded-md font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
