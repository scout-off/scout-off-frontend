'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPlayer } from '@/lib/contract';
import { PROGRESS_LABELS } from '@/types';
import type { Player } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';

interface ValidatorPlayerSearchProps {
  onSelect: (player: Player) => void;
}

export default function ValidatorPlayerSearch({
  onSelect,
}: ValidatorPlayerSearchProps) {
  const [query, setQuery] = useState('');
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const searchIdRef = useRef(0);

  const search = useCallback(async (identifier: string) => {
    const id = ++searchIdRef.current;
    setLoading(true);
    setPlayer(null);
    setNotFound(false);
    try {
      const result = await getPlayer(identifier);
      if (id !== searchIdRef.current) return; // stale
      if (result) {
        setPlayer(result as Player);
      } else {
        setNotFound(true);
      }
    } catch {
      if (id !== searchIdRef.current) return;
      setNotFound(true);
    } finally {
      if (id === searchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setPlayer(null);
      setNotFound(false);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => search(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleClear = () => {
    searchIdRef.current++; // invalidate any in-flight request
    setQuery('');
    setPlayer(null);
    setNotFound(false);
    setLoading(false);
  };

  const lastMilestoneDate = player?.milestones.length
    ? new Date(
        Math.max(...player.milestones.map((m) => m.timestamp)) * 1000,
      ).toLocaleDateString()
    : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="Search by player ID or wallet address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />
        {(query || player || notFound) && (
          <Button variant="secondary" onClick={handleClear} type="button">
            Clear
          </Button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-gray-400 animate-pulse" role="status">
          Searching…
        </p>
      )}

      {!loading && notFound && <EmptyState title="Player not found" />}

      {!loading && player && (
        <div className="bg-brand-card border border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white">{player.vitals.name}</h3>
              <p className="text-sm text-gray-400">
                {player.vitals.position} · {player.vitals.region}
              </p>
              <span className="inline-block mt-1 text-xs text-brand-green font-medium">
                {PROGRESS_LABELS[player.progressLevel]}
              </span>
              {lastMilestoneDate && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Last milestone: {lastMilestoneDate}
                </p>
              )}
            </div>
            <Button onClick={() => onSelect(player)} type="button">
              Select
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
