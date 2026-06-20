'use client';

import { useTranslations } from 'next-intl';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { usePlayer } from '@/hooks/usePlayer';
import ProgressBar from '@/components/ProgressBar';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import MilestoneSection from '@/components/player/MilestoneSection';

function PlayerDashboardContent() {
  const t = useTranslations('player_dashboard');
  const { walletAddress: publicKey } = useRequireWallet();
  const { player, loading, refetch } = usePlayer(publicKey);

  // Redirect handled by useRequireWallet — return null until the wallet hook
  // has either resolved a publicKey or kicked the redirect to '/'.
  if (!publicKey) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('title')}</h1>

      {loading ? (
        <p className="text-center text-gray-400 mt-20">Loading…</p>
      ) : player ? (
        <>
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-white">
              {player.vitals.name}
            </h2>
            <p className="text-gray-400 text-sm">
              {player.vitals.position} · {player.vitals.region}
            </p>
            <ProgressBar level={player.progressLevel} />
          </div>

          <MilestoneSection milestones={player.milestones} />
        </>
      ) : (
        <PlayerProfileForm onSuccess={() => refetch()} />
      )}
    </div>
  );
}

export default function PlayerDashboard() {
  return (
    <ErrorBoundary>
      <PlayerDashboardContent />
    </ErrorBoundary>
  );
}
