'use client';

import { useTranslations } from 'next-intl';
import { useContractCompatibility } from '@/hooks/useContractCompatibility';

/**
 * Blocking banner shown when the deployed contract's version doesn't match
 * what this app build expects. Unlike ContractPausedBanner, this is not
 * dismissible — an ABI mismatch means write actions will fail regardless of
 * whether the user acknowledges the message.
 */
export default function ContractIncompatibleBanner() {
  const t = useTranslations('contract_status');
  const { isIncompatible, message } = useContractCompatibility();

  if (!isIncompatible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-red-600 text-white px-4 py-3 sticky top-0 z-50 border-b border-red-800"
    >
      <strong className="font-semibold">{t('incompatible_title')}</strong>{' '}
      <span className="text-sm">
        {message ?? t('incompatible_message')}
      </span>
    </div>
  );
}
