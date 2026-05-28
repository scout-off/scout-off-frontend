"use client";
import { useState, useCallback } from "react";
import Head from "next/head";
import { useRequireWallet } from "@/hooks/useRequireWallet";
import { usePlayer } from "@/hooks/usePlayer";
import ProgressBar from "@/components/ProgressBar";
import PlayerProfileForm from "@/components/player/PlayerProfileForm";
import UpdateProfileForm from "@/components/player/UpdateProfileForm";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ipfsUrl } from "@/lib/ipfs";
import type { Player } from "@/types";

// ── Loading skeleton ──────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8 animate-pulse">
      <div className="h-9 w-64 rounded bg-gray-700" />
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div className="h-6 w-40 rounded bg-gray-700" />
        <div className="h-4 w-32 rounded bg-gray-700" />
        <div className="h-2 w-full rounded bg-gray-700" />
      </div>
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-3">
        <div className="h-5 w-36 rounded bg-gray-700" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-full rounded bg-gray-700" />
        ))}
      </div>
    </div>
  );
}

// ── Registered player dashboard ───────────────────────────────────────────────
function PlayerDashboard({ player, onRefresh }: { player: Player; onRefresh: () => void }) {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      {/* Stats card */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {player.ipfsHash && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ipfsUrl(player.ipfsHash)}
              alt={player.vitals.name}
              className="w-16 h-16 rounded-full object-cover bg-gray-700"
            />
          )}
          <div>
            <h2 className="text-xl font-semibold text-white">{player.vitals.name}</h2>
            <p className="text-gray-400 text-sm">
              {player.vitals.position} · {player.vitals.region} · Age {player.vitals.age}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{player.vitals.nationality}</p>
          </div>
        </div>
        <ProgressBar level={player.progressLevel} />
      </div>

      {/* Milestone timeline */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h3 className="font-semibold text-white mb-4">Milestone History</h3>
        {player.milestones.length === 0 ? (
          <p className="text-gray-500 text-sm">No milestones yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {player.milestones.map((m) => (
              <li key={m.id} className="text-sm text-gray-300 border-l-2 border-brand-green pl-3">
                {m.description}
                <span className="block text-xs text-gray-500 mt-0.5">
                  {new Date(m.timestamp * 1000).toLocaleDateString()} · {m.validator.slice(0, 8)}…
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Update profile */}
      <UpdateProfileForm player={player} onSuccess={onRefresh} />
    </div>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────
function PlayerDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const [registeredId, setRegisteredId] = useState<string | null>(null);

  // After registration, look up by the returned player ID; otherwise by wallet
  const lookupKey = registeredId ?? publicKey;
  const { player, loading, error } = usePlayer(lookupKey);

  const handleRegistered = useCallback((playerId: string) => {
    setRegisteredId(playerId);
  }, []);

  const handleRefresh = useCallback(() => {
    // Trigger re-fetch by toggling registeredId to force usePlayer to re-run
    setRegisteredId((prev) => (prev ? prev + " " : publicKey));
  }, [publicKey]);

  if (!publicKey) return null;

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Player Dashboard – ScoutOff</h1>

      {error && !player && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {player ? (
        <PlayerDashboard player={player} onRefresh={handleRefresh} />
      ) : (
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Create Your Profile</h2>
          <PlayerProfileForm onSuccess={handleRegistered} />
        </div>
      )}
    </div>
  );
}

export default function PlayerDashboardPage() {
  return (
    <ErrorBoundary>
      <PlayerDashboardContent />
    </ErrorBoundary>
  );
}
