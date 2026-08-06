'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useComparePlayers } from '@/hooks/useComparePlayers';
import PlayerCompareView from '@/components/scout/PlayerCompareView';
import Spinner from '@/components/ui/Spinner';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

const MAX_PLAYERS = 4;

function ParseIds() {
  const searchParams = useSearchParams();
  const raw = searchParams.get('ids') ?? '';

  const ids = useMemo(() => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.slice(0, MAX_PLAYERS);
  }, [raw]);

  const { players, loading, error } = useComparePlayers(ids);

  if (ids.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-gray-400 text-lg">
          Select 2 to {MAX_PLAYERS} players to compare.
        </p>
        <Link
          href="/scout"
          className="text-brand-green underline hover:opacity-80 transition"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-red-400">Failed to load players: {error}</p>
        <Link
          href="/scout"
          className="text-brand-green underline hover:opacity-80 transition"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-gray-400">No players found.</p>
        <Link
          href="/scout"
          className="text-brand-green underline hover:opacity-80 transition"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Compare Players</h1>
        <Link
          href="/scout"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
      {players.length < ids.length && (
        <p className="text-sm text-gray-500">
          {ids.length - players.length} player
          {ids.length - players.length !== 1 ? 's' : ''} could not be loaded.
        </p>
      )}
      <PlayerCompareView players={players} />
    </div>
  );
}

export default function ComparePage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        }
      >
        <ParseIds />
      </Suspense>
    </ErrorBoundary>
  );
}
