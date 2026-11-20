'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useWatchlist } from '@/hooks/useWatchlist';
import { getPlayer } from '@/lib/contract';
import PlayerCard from '@/components/PlayerCard';
import PlayerCardSkeleton from '@/components/PlayerCardSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import WatchlistNotesEditor from '@/components/scout/WatchlistNotesEditor';
import type { Player, WatchlistEntry } from '@/types';

function watchlistPlayersKey(entries: WatchlistEntry[]): string | null {
  if (entries.length === 0) return null;
  return `watchlist-players:${entries
    .map((e) => e.playerId)
    .sort()
    .join(',')}`;
}

async function fetchWatchlistPlayers(
  entries: WatchlistEntry[],
): Promise<Player[]> {
  const results = await Promise.allSettled(
    entries.map((e) => getPlayer(e.playerId) as Promise<Player | null>),
  );
  const players: Player[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value !== null) {
      players.push(r.value);
    }
  }
  return players;
}

export default function WatchlistPage() {
  const { walletAddress: publicKey } = useRequireWallet();
  const watchlist = useWatchlist(publicKey ?? null);
  const t = useTranslations('watchlist_notes');
  const [tagFilter, setTagFilter] = useState('');
  const allTags = Array.from(
    new Set(watchlist.entries.flatMap((e) => e.tags)),
  ).sort();

  const { data: players, isValidating } = useSWR<Player[]>(
    watchlistPlayersKey(watchlist.entries),
    () => fetchWatchlistPlayers(watchlist.entries),
    { revalidateOnFocus: false, dedupingInterval: 5_000 },
  );

  if (!publicKey) return null;

  const loading =
    watchlist.loading ||
    (watchlist.entries.length > 0 && isValidating && !players);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Watchlist</h1>
        <Link
          href="/scout"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {allTags.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-400">
          {t('filter_label')}
          <select
            data-testid="watchlist-tag-filter"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded bg-gray-800 p-1 text-white"
          >
            <option value="">{t('filter_all')}</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <PlayerCardSkeleton key={i} />
          ))}
        </div>
      ) : watchlist.entries.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          description="Star players from search results or their profile to add them here."
        />
      ) : (
        <div
          data-testid="watchlist-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {(players ?? []).map((player) => {
            const entry = watchlist.entries.find(
              (e) => e.playerId === player.id,
            );
            if (tagFilter && !entry?.tags.includes(tagFilter)) return null;
            return (
              <div key={player.id} className="flex flex-col gap-2">
                <PlayerCard
                  player={player}
                  isWatched
                  onToggleWatchlist={() => entry && watchlist.remove(entry)}
                />
                {entry && (
                  <WatchlistNotesEditor
                    key={`${entry.id}:${entry.updatedAt ?? 0}`}
                    entry={entry}
                    onSave={watchlist.updateNotes}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
