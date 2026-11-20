"use client";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useScout } from "@/hooks/useScout";
import PlayerCard from "@/components/PlayerCard";
import type { PlayerFilter, ProgressLevel } from "@/types";

const POSITIONS = ["GK", "CB", "LB", "RB", "CM", "CAM", "LW", "RW", "ST"];

export default function ScoutDashboard() {
  const { publicKey } = useWallet();
  const [filter, setFilter] = useState<PlayerFilter>({});
  const { players, loading, search } = useScout();

  if (!publicKey) {
    return (
      <p className="text-center text-gray-400 mt-20">
        Connect your wallet to access the scout dashboard.
      </p>
    );
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    search(filter);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Scout Dashboard</h1>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-wrap gap-4 items-end">
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
            onChange={(e) => setFilter((f) => ({ ...f, minLevel: Number(e.target.value) as ProgressLevel }))}
          >
            <option value="0">Any</option>
            <option value="1">Verified</option>
            <option value="2">Performance</option>
            <option value="3">Elite</option>
          </select>
        </div>
        <button type="submit" className="bg-brand-green text-black font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition">
          Search
        </button>
      </form>

      {/* Results */}
      {loading ? (
        <p className="text-gray-400">Searching…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {players.map((p) => <PlayerCard key={p.id} player={p} />)}
          {players.length === 0 && <p className="text-gray-500 col-span-3">No players found. Try adjusting your filters.</p>}
        </div>
      )}
    </div>
  );
}
