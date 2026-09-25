'use client';
import { useCallback } from 'react';
import Link from 'next/link';

import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useRequireSubscription } from '@/hooks/useRequireSubscription';
import { useScout } from '@/hooks/useScout';
import { useSubscription } from '@/hooks/useSubscription';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import {
  useScoutDashboardFilters,
  MAX_COMPARE_PLAYERS,
} from '@/hooks/useScoutDashboardFilters';
import PlayerCard from '@/components/PlayerCard';
import PlayerFilterForm from '@/components/scout/PlayerFilterForm';
import ReferralPanel from '@/components/scout/ReferralPanel';
import SpendingSummary from '@/components/scout/SpendingSummary';
import OnboardingTour from '@/components/ui/OnboardingTour';
import { scoutTourSteps, SCOUT_TOUR_ID } from '@/lib/tourSteps';
import type { Milestone, Player, PlayerFilter } from '@/types';
import PullToRefresh from '@/components/ui/PullToRefresh';
import ScrollToTop from '@/components/ui/ScrollToTop';
import SubscriptionStatusBanner from '@/components/scout/SubscriptionStatusBanner';
import WatchlistPreview from '@/components/scout/WatchlistPreview';
import RecentlyViewedStrip from '@/components/scout/RecentlyViewedStrip';
import SavedSearchesMenu from '@/components/scout/SavedSearchesMenu';
import ScoutSearchBar from '@/components/scout/ScoutSearchBar';
import ScoutResults from '@/components/scout/ScoutResults';

/**
 * Scout dashboard container: subscription guard and page layout. Filter
 * state lives in useScoutDashboardFilters, and each panel is its own
 * component (issue #1355).
 */
export default function ScoutDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const { isProtected, loading: subscriptionLoading } =
    useRequireSubscription();

  const tour = useOnboardingTour(
    SCOUT_TOUR_ID,
    scoutTourSteps,
    publicKey ?? undefined,
  );

  const {
    players,
    loading,
    isRateLimited,
    retryAfterSec,
    search,
    searchByName,
    refetch,
  } = useScout();
  const { subscription } = useSubscription();
  const watchlist = useWatchlist(publicKey ?? null);
  const savedSearches = useSavedSearches(publicKey ?? null);
  const recentlyViewed = useRecentlyViewed();

  const filters = useScoutDashboardFilters({
    loading,
    isRateLimited,
    retryAfterSec,
    search,
    searchByName,
  });
  const { compareIds, toggleCompare, handleSearch } = filters;
  const showCompareBar = compareIds.length >= 2;
  const compareLimitReached = compareIds.length >= MAX_COMPARE_PLAYERS;

  const handleToggleWatchlist = useCallback(
    (targetPlayer: Player) => {
      const existing = watchlist.entries.find(
        (e) => e.playerId === targetPlayer.id,
      );
      if (existing) {
        watchlist.remove(existing);
      } else {
        watchlist.add(targetPlayer.id);
      }
    },
    [watchlist],
  );

  const handleSaveSearch = useCallback(
    (name: string, filter: PlayerFilter) => {
      savedSearches.save(name, filter);
    },
    [savedSearches],
  );

  if (!publicKey) return null;
  if (subscriptionLoading || !isProtected) return null;

  const showEmptyState =
    filters.searchHasCompleted && !loading && players.length === 0;

  const renderPlayerCard = (
    p: Player,
    milestones?: { milestones?: Milestone[]; milestonesLoading: boolean },
  ) => (
    <PlayerCard
      player={p}
      isWatched={watchlist.isWatched(p.id)}
      onToggleWatchlist={() => handleToggleWatchlist(p)}
      isCompareSelected={compareIds.includes(p.id)}
      onToggleCompare={() => toggleCompare(p.id)}
      {...milestones}
    />
  );

  return (
    <PullToRefresh onRefresh={refetch} isLoading={loading}>
      <OnboardingTour
        isVisible={tour.isVisible}
        currentStep={tour.currentStep}
        currentStepData={tour.currentStepData}
        steps={tour.steps}
        onNext={tour.nextStep}
        onPrev={tour.prevStep}
        onDismiss={tour.dismissTour}
        onSkip={tour.skipTour}
        onComplete={tour.completeTour}
      />
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-white">Scout Dashboard</h1>

        {subscription && (
          <SubscriptionStatusBanner subscription={subscription} />
        )}

        <ReferralPanel />

        <SpendingSummary />

        <WatchlistPreview
          entries={watchlist.entries}
          onRemove={watchlist.remove}
        />

        <RecentlyViewedStrip entries={recentlyViewed.entries} />

        <SavedSearchesMenu
          searches={savedSearches.searches}
          onApply={(s) => {
            handleSearch(s.filter);
            savedSearches.markViewed(s);
          }}
          onRename={savedSearches.rename}
          onRemove={savedSearches.remove}
        />

        <ScoutSearchBar
          nameQuery={filters.nameQuery}
          onNameQueryChange={filters.setNameQuery}
          remainingSec={filters.remainingSec}
          showNoNameMatches={
            !loading && players.length === 0 && filters.searchHasCompleted
          }
          renderPlayer={(p) => renderPlayerCard(p)}
        />

        <div
          className={`bg-brand-card border border-gray-800 rounded-xl p-5${filters.nameQuery ? ' opacity-50 pointer-events-none' : ''}`}
          data-tour="filter-section"
          data-testid="filter-form"
        >
          <PlayerFilterForm
            onSearch={handleSearch}
            resetKey={filters.resetKey}
            onSaveSearch={handleSaveSearch}
            disabled={filters.remainingSec !== null}
          />
        </div>

        {showCompareBar && (
          <div className="flex items-center justify-between bg-brand-card border border-brand-green rounded-xl px-5 py-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-200">
                {compareIds.length} player{compareIds.length !== 1 ? 's' : ''}{' '}
                selected for comparison
              </span>
              {compareLimitReached && (
                <span className="text-xs text-brand-green">
                  Limit reached: up to {MAX_COMPARE_PLAYERS} players can be
                  compared.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/scout/compare?ids=${compareIds.join(',')}`}
                className="px-4 py-1.5 rounded-lg border border-brand-green text-sm text-brand-green hover:bg-brand-green hover:text-black transition"
              >
                Compare
              </Link>
              <button
                type="button"
                onClick={filters.clearCompare}
                className="px-4 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-red-500 hover:text-red-400 transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <ScoutResults
          players={players}
          showSkeletons={filters.showSkeletons}
          showEmptyState={showEmptyState}
          onResetFilters={filters.handleClearFilters}
          renderPlayer={renderPlayerCard}
        />
      </div>
      <ScrollToTop />
    </PullToRefresh>
  );
}
