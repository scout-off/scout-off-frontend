'use client';
import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { usePlayer } from '@/hooks/usePlayer';
import ProgressBar from '@/components/ProgressBar';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import UpdateProfileForm from '@/components/player/UpdateProfileForm';
import MilestoneTimeline from '@/components/player/MilestoneTimeline';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

type TabId = 'register' | 'profile';

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'register', labelKey: 'tab_register' },
  { id: 'profile', labelKey: 'tab_profile' },
] as const;

function PlayerDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const { player, loading, refetch } = usePlayer(publicKey);
  const t = useTranslations('player_dashboard');
  const isRegistered = !!player;

  const [activeTab, setActiveTab] = useState<TabId>(
    isRegistered ? 'profile' : 'register',
  );

  useEffect(() => {
    if (!loading) {
      setActiveTab(isRegistered ? 'profile' : 'register');
    }
  }, [loading, isRegistered]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = TABS.findIndex((t) => t.id === activeTab);
      let nextIndex = idx;
      if (e.key === 'ArrowRight') {
        nextIndex = (idx + 1) % TABS.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (idx - 1 + TABS.length) % TABS.length;
      }
      if (nextIndex !== idx) {
        e.preventDefault();
        setActiveTab(TABS[nextIndex].id);
      }
    },
    [activeTab],
  );

  if (!publicKey) {
    return null; // Redirect handled by useRequireWallet
  }

  if (loading) {
    return <p className="text-center text-gray-400 mt-20">Loading…</p>;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('title')}</h1>

      <div role="tablist" aria-label={t('title')} className="flex border-b border-gray-800">
        {TABS.map((tab) => {
          const isDisabled = !isRegistered && tab.id === 'profile';
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              aria-disabled={isDisabled}
              tabIndex={activeTab === tab.id ? 0 : -1}
              disabled={isDisabled}
              onKeyDown={handleKeyDown}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-inset',
                activeTab === tab.id
                  ? 'text-brand-green border-b-2 border-brand-green'
                  : isDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-gray-200 border-b-2 border-transparent',
              ].join(' ')}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="tabpanel-register"
        aria-labelledby="tab-register"
        hidden={activeTab !== 'register'}
      >
        {activeTab === 'register' && (
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-6">
              Create Your Profile
            </h2>
            <PlayerProfileForm onSuccess={() => refetch()} />
          </div>
        )}
      </div>

      <div
        role="tabpanel"
        id="tabpanel-profile"
        aria-labelledby="tab-profile"
        hidden={activeTab !== 'profile'}
      >
        {activeTab === 'profile' && isRegistered ? (
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
              <h3 className="font-semibold text-white mb-6">
                {t('milestones')}
              </h3>
              <MilestoneTimeline
                milestones={player.milestones}
                currentLevel={player.progressLevel}
              />
            </div>

            <UpdateProfileForm player={player} onSuccess={refetch} />
          </>
        ) : activeTab === 'profile' ? (
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-400">{t('register_prompt')}</p>
          </div>
        ) : null}
      </div>
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
