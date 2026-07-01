'use client';
import { useState, useCallback, useEffect } from 'react';
import type React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { usePlayer } from '@/hooks/usePlayer';
import ProgressBar from '@/components/ProgressBar';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import UpdateProfileForm from '@/components/player/UpdateProfileForm';
import MilestoneTimeline from '@/components/player/MilestoneTimeline';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import type { Player, PlayerVitals } from '@/types';

type TabId = 'register' | 'profile';

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'register', labelKey: 'tab_register' },
  { id: 'profile', labelKey: 'tab_profile' },
] as const;

/** Spinner used in the pending-confirmation badge */
function InlineSpinner() {
  return (
    <svg
      className="animate-spin h-3 w-3"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function PlayerDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const { player, loading, refetch, optimisticUpdate } = usePlayer(publicKey);
  const t = useTranslations('player_dashboard');
  const router = useRouter();

  const [successPlayerId, setSuccessPlayerId] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  /** True while we're waiting for on-chain confirmation of a just-registered profile */
  const [isPendingConfirmation, setIsPendingConfirmation] = useState(false);

  const isRegistered = !!player;

  const [activeTab, setActiveTab] = useState<TabId>(
    isRegistered ? 'profile' : 'register',
  );

  useEffect(() => {
    if (!loading) {
      setActiveTab(isRegistered ? 'profile' : 'register');
    }
  }, [loading, isRegistered]);

  useEffect(() => {
    if (!successPlayerId) return;

    setRedirectCountdown(3);
    const intervalId = window.setInterval(() => {
      setRedirectCountdown((current) => current - 1);
    }, 1000);
    const timerId = window.setTimeout(() => {
      router.push(`/player/${successPlayerId}`);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timerId);
    };
  }, [router, successPlayerId]);

  const handleCopyPlayerId = useCallback(async () => {
    if (!successPlayerId) return;

    try {
      await navigator.clipboard.writeText(successPlayerId);
      setCopyFeedback('Copied');
      window.setTimeout(() => setCopyFeedback(''), 1500);
    } catch {
      setCopyFeedback('Unable to copy');
    }
  }, [successPlayerId]);

  const handleViewProfile = useCallback(() => {
    if (!successPlayerId) return;
    router.push(`/player/${successPlayerId}`);
  }, [router, successPlayerId]);

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

  /**
   * Called by PlayerProfileForm when registerPlayer resolves.
   * 1. Immediately populate the SWR cache with the submitted vitals (optimistic).
   * 2. Switch to the profile tab so the user sees their data right away.
   * 3. Trigger a background re-fetch; replace optimistic data with confirmed data.
   * 4. On error, discard optimistic data and show the register tab again.
   */
  const handleRegistrationSuccess = useCallback(
    async ({
      playerId,
      vitals,
      ipfsHash,
    }: {
      playerId: string;
      vitals: PlayerVitals;
      ipfsHash: string;
    }) => {
      if (!publicKey) return;

      // Build a minimal optimistic Player from the submitted form data
      const optimisticPlayer: Player = {
        id: playerId,
        wallet: publicKey,
        vitals,
        ipfsHash,
        progressLevel: 0,
        milestones: [],
        createdAt: Math.floor(Date.now() / 1000),
      };

      // 1. Show optimistic data immediately
      optimisticUpdate(optimisticPlayer);
      setSuccessPlayerId(playerId);
      setCopyFeedback('');
      setIsPendingConfirmation(true);
      setActiveTab('profile');

      // 2. Re-fetch confirmed on-chain data in the background
      try {
        await refetch();
      } catch {
        setSuccessPlayerId(null);
        // On error, discard the optimistic state so the user is not left with stale data
        refetch({ discardOptimistic: true }).catch(() => {});
        setActiveTab('register');
      } finally {
        setIsPendingConfirmation(false);
      }
    },
    [publicKey, optimisticUpdate, refetch],
  );

  if (!publicKey) {
    return null; // Redirect handled by useRequireWallet
  }

  if (loading) {
    return <p className="text-center text-gray-400 mt-20">LoadingΓÇª</p>;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('title')}</h1>

      <div
        role="tablist"
        aria-label={t('title')}
        className="flex border-b border-gray-800"
      >
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
            <PlayerProfileForm onSuccess={handleRegistrationSuccess} />
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
            {/* Pending-confirmation banner */}
            {isPendingConfirmation && (
              <div
                role="status"
                aria-live="polite"
                data-testid="pending-confirmation"
                className="flex items-center gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300"
              >
                <InlineSpinner />
                <span>Confirming on-chainΓÇª This may take a few seconds.</span>
              </div>
            )}

            {successPlayerId && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"
              >
                <div className="flex flex-col gap-3">
                  <p className="font-semibold text-white">
                    Registration complete! Redirecting to your profile in{' '}
                    {redirectCountdown > 0 ? redirectCountdown : 0} seconds.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-300">
                      Player ID:{' '}
                      <span className="font-mono text-white">
                        {successPlayerId}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPlayerId}
                      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                    >
                      {copyFeedback || 'Copy player ID'}
                    </button>
                    <button
                      type="button"
                      onClick={handleViewProfile}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      View profile
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-white">
                  {player.vitals.name}
                </h2>
                {isPendingConfirmation && (
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-300"
                  >
                    <InlineSpinner />
                    Pending
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm">
                {player.vitals.position} ┬╖ {player.vitals.region}
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
