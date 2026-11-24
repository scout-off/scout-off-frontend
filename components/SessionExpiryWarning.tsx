'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';

/** How long before expiry to show the warning (milliseconds). */
const WARNING_BEFORE_MS = 2 * 60 * 1000; // 2 minutes

export default function SessionExpiryWarning() {
  const t = useTranslations('session');
  const { isAuthenticated, sessionExpiresAt, reauthenticate } = useWallet();
  const { show: showToast } = useToast();
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReauthenticate = useCallback(async () => {
    setIsReauthenticating(true);
    try {
      await reauthenticate();
      setShowWarning(false);
      showToast({ variant: 'success', message: t('renewedSuccess') });
    } catch {
      showToast({
        variant: 'error',
        message: t('renewFailed'),
      });
    } finally {
      setIsReauthenticating(false);
    }
  }, [reauthenticate, showToast, t]);

  const handleDismiss = useCallback(() => {
    setShowWarning(false);
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !sessionExpiresAt) return;

    // Reset dismissal when session expiresAt changes (new session)
    setDismissed(false);

    function checkAndSetTimer() {
      const now = Date.now();
      const timeLeft = sessionExpiresAt! - now;

      if (timeLeft <= 0) {
        // Already expired — the existing error-handling will surface this
        setShowWarning(false);
        return;
      }

      if (timeLeft <= WARNING_BEFORE_MS && !dismissed) {
        setShowWarning(true);
        return;
      }

      // Set a timer to fire when we reach the warning threshold
      const delay = timeLeft - WARNING_BEFORE_MS;
      if (delay > 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (!dismissed) setShowWarning(true);
        }, delay);
      }
    }

    checkAndSetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, sessionExpiresAt, dismissed]);

  if (!showWarning) return null;

  const minutesLeft = sessionExpiresAt
    ? Math.max(1, Math.round((sessionExpiresAt - Date.now()) / 60000))
    : 2;

  return (
    <Modal
      isOpen={showWarning}
      onClose={handleDismiss}
      title={t('expiringSoonTitle')}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-400 text-lg"
          >
            ⏳
          </span>
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('expiringSoonMessage', { minutes: minutesLeft })}
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isReauthenticating}
            className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition disabled:opacity-50"
          >
            {t('dismiss')}
          </button>
          <button
            type="button"
            onClick={handleReauthenticate}
            disabled={isReauthenticating}
            className="px-4 py-2 rounded-lg font-medium bg-brand-green text-black hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isReauthenticating && <Spinner size="sm" />}
            {t('reauthenticate')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
