'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';

/**
 * Shows a warning banner when the currently-connected wallet address
 * differs from the identity the session cookie authenticated. This can
 * happen when a user switches accounts in their wallet extension without
 * explicitly disconnecting and re-authenticating first.
 *
 * When displayed, the user must re-authenticate to continue operations.
 */
export default function SessionMismatchWarning() {
  const t = useTranslations('session_mismatch_warning');
  const { publicKey, sessionMismatch, reauthenticate } = useWallet();
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Only show when there's a mismatch and we're authenticated
  if (isDismissed || !sessionMismatch || !publicKey) return null;

  const handleReauthenticate = async () => {
    setIsReauthenticating(true);
    try {
      await reauthenticate();
    } finally {
      setIsReauthenticating(false);
    }
  };

  return (
    <div
      role="alert"
      className="bg-red-500 text-white px-4 py-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <p className="font-medium text-sm">{t('title')}</p>
          <p className="text-sm text-red-100 mt-1">
            {t('body', { address: publicKey.slice(0, 8) })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          onClick={handleReauthenticate}
          disabled={isReauthenticating}
          className="flex-1 sm:flex-none bg-white text-red-600 hover:bg-red-50 px-4 py-2 rounded text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isReauthenticating ? t('reauthenticating') : t('reauthenticate')}
        </button>
        <button
          onClick={() => setIsDismissed(true)}
          className="text-red-100 hover:text-white transition px-2"
          aria-label={t('dismiss_aria')}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
