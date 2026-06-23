'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useScout } from '@/hooks/useScout';
import { getPlayer } from '@/lib/contract';
import PlayerCard from '@/components/PlayerCard';
import PlayerCardSkeleton from '@/components/PlayerCardSkeleton';
import PlayerFilterForm from '@/components/scout/PlayerFilterForm';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import type { Player, PlayerFilter } from '@/types';

const PAGE_SIZE = 12;

function isStellarKey(v: string) {
  return /^G[A-Z2-7]{55}$/.test(v);
}

function ScoutDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { players, loading, search } = useScout();
  const hasLoaded = useRef(false);

  // Wallet search state
  const [walletQuery, setWalletQuery] = useState('');
  const [searchResult, setSearchResult] = useState<
    Player | null | 'not-found' | 'invalid'
  >(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = players.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.replace(`?${params.toString()}`);
  }

  useEffect(() => {
    if (!loading && players.length >= 0) hasLoaded.current = true;
  }, [loading, players]);

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

  if (!publicKey) return null;

  const showSkeletons = loading && !hasLoaded.current;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Scout Dashboard</h1>

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
              <p className="text-sm text-gray-500">Player not found.</p>
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
        <PlayerFilterForm onSearch={handleSearch} />
      </div>

      {/* Results */}
      {showSkeletons ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <PlayerCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {players.length > 0 && (
            <p className="text-sm text-gray-400">
              {players.length} player{players.length !== 1 ? 's' : ''} found
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginated.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
            {players.length === 0 && (
              <p className="text-gray-500 col-span-3">
                No players found. Try adjusting your filters.
              </p>
            )}
          </div>
          {players.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage <= 1}
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 hover:border-brand-green transition"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 hover:border-brand-green transition"
              >
                Next
              </button>
            </div>
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
