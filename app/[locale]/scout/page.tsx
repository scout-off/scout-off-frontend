'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useRequireSubscription } from '@/hooks/useRequireSubscription';
import { useScout } from '@/hooks/useScout';
import { useSubscription } from '@/hooks/useSubscription';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { getPlayer } from '@/lib/contract';
import PlayerCard from '@/components/PlayerCard';
import PlayerCardSkeleton from '@/components/PlayerCardSkeleton';
import PlayerFilterForm from '@/components/scout/PlayerFilterForm';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import Spinner from '@/components/ui/Spinner';
import type { Player, PlayerFilter } from '@/types';

const PAGE_SIZE = 12;

function isStellarKey(v: string) {
  return /^G[A-Z2-7]{55}$/.test(v);
}

function ScoutDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const { isProtected, loading: subscriptionLoading } =
    useRequireSubscription();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { players, loading, search } = useScout();
  const { subscription } = useSubscription();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const hasLoaded = useRef(false);
  const loadingEverStarted = useRef(false);
  const [searchHasCompleted, setSearchHasCompleted] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Wallet search state
  const [walletQuery, setWalletQuery] = useState('');
  const [searchResult, setSearchResult] = useState<
    Player | null | 'not-found' | 'invalid'
  >(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Infinite scroll — manages the visible slice of `players`
  const {
    visibleItems: visiblePlayers,
    isFetchingMore,
    isExhausted,
    sentinelRef,
    goToPage,
    currentPage,
    totalPages,
  } = useInfiniteScroll<Player>({ items: players, pageSize: PAGE_SIZE });

  // Keep ?page= query param in sync so keyboard users can share / bookmark page
  const pageParam = Math.max(1, Number(searchParams.get('page') ?? '1'));

  function setPage(p: number) {
    const clamped = Math.max(1, Math.min(p, totalPages));
    goToPage(clamped);
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(clamped));
    router.replace(`?${params.toString()}`);
  }

  useEffect(() => {
    if (loading) {
      loadingEverStarted.current = true;
    } else if (loadingEverStarted.current) {
      hasLoaded.current = true;
      setSearchHasCompleted(true);
    }
  }, [loading]);

  // Debounced wallet search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!walletQuery) {
      setSearchResult(null);
      return;
    }

    if (!isStellarKey(walletQuery)) {
      setSearchResult('invalid');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await getPlayer(walletQuery);
        setSearchResult(result ? (result as Player) : 'not-found');
      } catch {
        setSearchResult('not-found');
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [walletQuery]);

  const handleSearch = useCallback(
    (filter: PlayerFilter) => {
      hasLoaded.current = false;
      search(filter);
    },
    [search],
  );

  const handleClearFilters = useCallback(() => {
    setResetKey((k) => k + 1);
  }, []);

  if (!publicKey) return null;
  if (subscriptionLoading || !isProtected) return null;

  const showSkeletons = loading && !hasLoaded.current;
  const showEmptyState = searchHasCompleted && !loading && players.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Scout Dashboard</h1>

      {/* Subscription status */}
      {subscription &&
        (() => {
          const daysRemaining = Math.floor(
            (subscription.expiresAt - now / 1000) / 86400,
          );
          const tierLabel =
            subscription.tier.charAt(0).toUpperCase() +
            subscription.tier.slice(1);

          if (daysRemaining <= 0) {
            return (
              <div className="flex items-center gap-3 rounded-xl border border-red-500 bg-brand-card px-4 py-3 text-sm">
                <span className="text-red-400">Subscription expired</span>
                <Link
                  href="/scout/subscribe"
                  className="ml-auto text-brand-green underline hover:opacity-80 transition"
                >
                  Renew
                </Link>
              </div>
            );
          }

          if (daysRemaining <= 7) {
            return (
              <div className="flex items-center gap-3 rounded-xl border border-orange-400 bg-brand-card px-4 py-3 text-sm text-gray-200">
                <span>
                  {tierLabel} — expires in {daysRemaining} day
                  {daysRemaining !== 1 ? 's' : ''}
                </span>
                <Link
                  href="/scout/subscribe"
                  className="ml-auto text-brand-green underline hover:opacity-80 transition"
                >
                  Renew
                </Link>
              </div>
            );
          }

          return (
            <div className="flex items-center gap-3 rounded-xl border border-brand-green bg-brand-card px-4 py-3 text-sm text-gray-200">
              {tierLabel} — {daysRemaining} days remaining
            </div>
          );
        })()}

      {/* Wallet address search */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
        <label
          className="text-sm font-medium text-gray-300"
          htmlFor="wallet-search"
        >
          Search by Wallet Address
        </label>
        <input
          id="wallet-search"
          className="input"
          placeholder="G... (56-character Stellar public key)"
          value={walletQuery}
          onChange={(e) => setWalletQuery(e.target.value.trim())}
          autoComplete="off"
          spellCheck={false}
        />
        {walletQuery && (
          <div className="mt-1">
            {searchLoading && (
              <p className="text-sm text-gray-400">Searching…</p>
            )}
            {!searchLoading && searchResult === 'invalid' && (
              <p className="text-sm text-red-400">
                Invalid Stellar address — must be a 56-character key starting
                with G.
              </p>
            )}
            {!searchLoading && searchResult === 'not-found' && (
              <EmptyState
                title="No players found"
                description="No player is registered with that wallet address."
              />
            )}
            {!searchLoading &&
              searchResult &&
              searchResult !== 'invalid' &&
              searchResult !== 'not-found' && (
                <div className="mt-2 max-w-sm">
                  <PlayerCard player={searchResult} />
                </div>
              )}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-5">
        <PlayerFilterForm
          onSearch={handleSearch}
          resetKey={resetKey}
        />
      </div>

      {/* Results */}
      {showSkeletons ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <PlayerCardSkeleton key={i} />
          ))}
        </div>
      ) : showEmptyState ? (
        <EmptyState
          title="No players found"
          description="Try adjusting your filters."
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-12 h-12 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
              />
            </svg>
          }
          action={{ label: 'Reset Filters', onClick: handleClearFilters }}
        />
      ) : (
        <>
          {players.length > 0 && (
            <p className="text-sm text-gray-400">
              {players.length} player{players.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Player grid — shows progressively revealed items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visiblePlayers.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>

          {/* Infinite scroll sentinel — observed by IntersectionObserver */}
          <div ref={sentinelRef} aria-hidden="true" />

          {/* Loading more indicator */}
          {isFetchingMore && (
            <div className="flex justify-center py-4">
              <Spinner size="md" />
            </div>
          )}

          {/* End-of-results message */}
          {isExhausted && players.length > PAGE_SIZE && (
            <p
              role="status"
              aria-live="polite"
              className="text-center text-sm text-gray-500 py-2"
            >
              No more results
            </p>
          )}

          {/* ── Accessible pagination fallback ──────────────────────────────
              Hidden visually on pointer devices; always reachable by keyboard
              so users who don't scroll can still advance through results.
              sr-only hides the heading from sighted users but preserves it
              for screen reader navigation. */}
          {players.length > PAGE_SIZE && (
            <nav
              aria-label="Player list pagination"
              className="flex flex-col items-center gap-3"
            >
              <p className="sr-only">
                Keyboard pagination — use these buttons if you prefer not to
                scroll
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 hover:border-brand-green transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
                >
                  Previous
                </button>
                <span
                  className="text-sm text-gray-400"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 hover:border-brand-green transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export default function ScoutDashboard() {
  return (
    <ErrorBoundary>
      <ScoutDashboardContent />
    </ErrorBoundary>
  );
}
