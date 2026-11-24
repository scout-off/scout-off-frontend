'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { checkIsValidator } from '@/lib/contract';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import type { Player } from '@/types';

// Validator-only components lazy-loaded to avoid bundling into shared chunks
// for the much larger player/scout user base (issue #967).
const ValidatorPlayerSearch = dynamic(
  () => import('@/components/validator/ValidatorPlayerSearch'),
  { ssr: false },
);
const ApprovedPlayersRoster = dynamic(
  () => import('@/components/validator/ApprovedPlayersRoster'),
  { ssr: false },
);
const PendingMilestoneQueue = dynamic(
  () => import('@/components/validator/PendingMilestoneQueue'),
  { ssr: false },
);
const ApproveForm = dynamic(
  () => import('@/components/validator/ApproveForm'),
  { ssr: false },
);
const RevokeForm = dynamic(() => import('@/components/validator/RevokeForm'), {
  ssr: false,
});

function ValidatorDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const t = useTranslations('validator');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check if wallet is authorized as a validator
  useEffect(() => {
    if (!publicKey) {
      setAuthChecking(false);
      return;
    }

    checkIsValidator(publicKey)
      .then((result) => setIsAuthorized(result as boolean))
      .catch(() => setIsAuthorized(false))
      .finally(() => setAuthChecking(false));
  }, [publicKey]);

  const handlePlayerSelected = useCallback((player: Player) => {
    setSelectedPlayer(player);
  }, []);

  const handleSuccess = useCallback(() => {
    // Forms handle their own success states
  }, []);

  if (!publicKey) return null;

  // Show loading state while checking authorization
  if (authChecking) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-gray-400 animate-pulse">{t('verifying')}</p>
      </div>
    );
  }

  // Show empty state if wallet is not authorized
  if (!isAuthorized) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <EmptyState
          title={t('access_only_title')}
          description={t('access_only_description')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <Link
          href="/validator/leaderboard"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          View Leaderboard →
        </Link>
      </div>

      {/* Player search section */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          {t('find_player')}
        </h2>
        <ValidatorPlayerSearch onSelect={handlePlayerSelected} />
      </div>

      {/* Pending milestone queue */}
      <PendingMilestoneQueue validatorAddress={publicKey} />

      {/* Approved players roster */}
      <ApprovedPlayersRoster validatorAddress={publicKey} />

      {/* Selected player section */}
      {selectedPlayer && (
        <div className="flex flex-col gap-6">
          {/* Player info header */}
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              {selectedPlayer.vitals.name}
            </h3>
            <p className="text-gray-400 text-sm">
              {selectedPlayer.vitals.position} · {selectedPlayer.vitals.region}·{' '}
              {selectedPlayer.vitals.nationality}
            </p>
            <p className="text-gray-400 text-xs mt-2 font-mono">
              ID: {selectedPlayer.id}
            </p>
          </div>

          {/* Approve form */}
          <ApproveForm onSuccess={handleSuccess} />

          {/* Revoke form */}
          <RevokeForm player={selectedPlayer} onSuccess={handleSuccess} />
        </div>
      )}
    </div>
  );
}

export default function ValidatorDashboard() {
  return (
    <ErrorBoundary>
      <ValidatorDashboardContent />
    </ErrorBoundary>
  );
}
