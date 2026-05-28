"use client";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireWallet } from "@/hooks/useRequireWallet";
import { useScout } from "@/hooks/useScout";
import PlayerCard from "@/components/PlayerCard";
import PlayerCardSkeleton from "@/components/PlayerCardSkeleton";
import PlayerFilterForm from "@/components/scout/PlayerFilterForm";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import type { PlayerFilter } from "@/types";

const PAGE_SIZE = 12;

function ScoutDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { players, loading, search } = useScout();
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

  function handleFilter(filter: PlayerFilter) {
    hasLoaded.current = false;
    setPage(1);
    search(filter).then(() => {
      hasLoaded.current = true;
    });
  }

  useEffect(() => {
    if (!loading && players.length >= 0) hasLoaded.current = true;
  }, [loading, players]);

  if (!publicKey) return null;

  const showSkeletons = loading && !hasLoaded.current;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Scout Dashboard</h1>

      <PlayerFilterForm onFilter={handleFilter} />

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
              {players.length} player{players.length !== 1 ? "s" : ""} found
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
