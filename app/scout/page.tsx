"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireWallet } from "@/hooks/useRequireWallet";
import PlayerCard from "@/components/PlayerCard";
import PlayerCardSkeleton from "@/components/PlayerCardSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import type { PlayerFilter, ProgressLevel } from "@/types";

const POSITIONS = ["GK", "CB", "LB", "RB", "CM", "CAM", "LW", "RW", "ST"];
const PAGE_SIZE = 12;

function ScoutDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<PlayerFilter>({});
  const { players, loading, search } = useScout();

  // Track whether we've ever loaded data (to suppress skeletons on re-filter)
  const hasLoaded = useRef(false);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = players.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.replace(`?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    hasLoaded.current = false;
    setPage(1);
    search(filter).then(() => { hasLoaded.current = true; });
  }

  // Mark loaded after first result
  useEffect(() => {
    if (!loading && players.length >= 0) hasLoaded.current = true;
  }, [loading, players]);

  if (!publicKey) {
    return null; // Redirect handled by useRequireWallet
  }

  const showSkeletons = loading && !hasLoaded.current;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Scout Dashboard</h1>

      {/* Filter bar */}
      <form
        onSubmit={handleSearch}
        className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-wrap gap-4 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Region</label>
          <input
            className="input w-40"
            placeholder="e.g. Africa"
            onChange={(e) => setFilter((f) => ({ ...f, region: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Position</label>
          <select
            className="input w-32"
            onChange={(e) => setFilter((f) => ({ ...f, position: e.target.value }))}
          >
            <option value="">Any</option>
            {POSITIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Min Level</label>
          <select
            className="input w-32"
            onChange={(e) =>
              setFilter((f) => ({ ...f, minLevel: Number(e.target.value) as ProgressLevel }))
            }
          >
            <option value="0">Any</option>
            <option value="1">Verified</option>
            <option value="2">Performance</option>
            <option value="3">Elite</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-brand-green text-black font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition"
        >
          Search
        </button>
      </form>

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
            <p className="text-sm text-gray-400">{players.length} player{players.length !== 1 ? "s" : ""} found</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginated.map((p) => <PlayerCard key={p.id} player={p} />)}
            {players.length === 0 && (
              <p className="text-gray-500 col-span-3">No players found. Try adjusting your filters.</p>
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
