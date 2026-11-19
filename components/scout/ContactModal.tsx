'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useWallet } from '@/lib/hooks/useWallet';
import { contactPlayer, type ContactDetails } from '@/lib/api/scout';
import { formatCurrency } from '@/lib/localeFormat';

interface ContactModalProps {
  playerId: string;
  playerName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ContactModal({
  playerId,
  playerName,
  isOpen,
  onClose,
}: ContactModalProps) {
  const t = useTranslations('scout.contact');
  const locale = useLocale();
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const { showToast } = useToast();

  const [details, setDetails] = useState<ContactDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDetails(null);
      setError(null);
    }
  }, [isOpen]);

  const handleUnlock = useCallback(async () => {
    if (!isConnected || !address) {
      showToast(t('connectWallet'), 'error');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contactPlayer(playerId);
      setDetails(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('unlockError');
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, playerId, showToast, t]);

  const handleMessagePlayer = useCallback(() => {
    onClose();
    router.push(`/${locale}/messages?compose=${encodeURIComponent(playerId)}`);
  }, [locale, onClose, playerId, router]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('title', { name: playerName })}>
      <div className="space-y-4">
        {!details ? (
          <>
            <p className="text-sm text-gray-600">
              {t('description', { name: playerName })}
            </p>
            {details?.price !== undefined && (
              <p className="text-sm font-medium text-gray-900">
                {formatCurrency(details.price, locale)}
              </p>
            )}
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <Button
              onClick={handleUnlock}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? <Spinner size="sm" /> : t('unlock')}
            </Button>
          </>
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium text-gray-700">{t('email')}</dt>
                <dd className="text-gray-900">{details.email}</dd>
              </div>
              {details.phone && (
                <div>
                  <dt className="font-medium text-gray-700">{t('phone')}</dt>
                  <dd className="text-gray-900">{details.phone}</dd>
                </div>
              )}
            </dl>
            <Button onClick={handleMessagePlayer} className="w-full">
              {t('messagePlayer')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
