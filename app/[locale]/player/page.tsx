'use client';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { usePlayer } from '@/hooks/usePlayer';
import ProgressBar from '@/components/ProgressBar';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import UpdateProfileForm from '@/components/player/UpdateProfileForm';
import MilestoneTimeline from '@/components/player/MilestoneTimeline';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

function PlayerDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const { player, loading, refetch } = usePlayer(publicKey);

  if (!publicKey) {
    return null; // Redirect handled by useRequireWallet
  }

  if (loading) {
    return <p className="text-center text-gray-400 mt-20">Loading…</p>;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Player Dashboard</h1>

      {player ? (
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
            <h3 className="font-semibold text-white mb-6">Milestone History</h3>
            <MilestoneTimeline
              milestones={player.milestones}
              currentLevel={player.progressLevel}
            />
          </div>

          <UpdateProfileForm player={player} onSuccess={refetch} />
        </>
      ) : (
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6">
            Create Your Profile
          </h2>
          <PlayerProfileForm onSuccess={() => refetch()} />
        </div>
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
