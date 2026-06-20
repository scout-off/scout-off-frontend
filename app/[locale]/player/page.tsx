'use client';

import { useTranslations } from 'next-intl';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { usePlayer } from '@/hooks/usePlayer';
import ProgressBar from '@/components/ProgressBar';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';

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

          <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">
              Milestone History
            </h3>
            {player.milestones.length === 0 ? (
              <p className="text-gray-500 text-sm">No milestones yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {player.milestones.map((m) => (
                  <li
                    key={m.id}
                    className="text-sm text-gray-300 border-l-2 border-brand-green pl-3"
                  >
                    {m.description}
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {new Date(m.timestamp * 1000).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
