"use client";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { buildPayToContact } from "@/lib/contract";
import { ipfsUrl } from "@/lib/ipfs";
import PlayerStatsCard from "@/components/player/PlayerStatsCard";
import IPFSMediaGallery from "@/components/player/IPFSMediaGallery";
import MilestoneTimeline from "@/components/player/MilestoneTimeline";
import { PROGRESS_LABELS } from "@/types";
import type { Player } from "@/types";

export default function PlayerProfileClient({ player }: { player: Player }) {
  const { publicKey, signAndSubmit } = useWallet();
  const [contacting, setContacting] = useState(false);

  async function handleContact() {
    if (!publicKey || !player.id) return;
    setContacting(true);
    try {
      const xdr = await buildPayToContact(publicKey, player.id);
      await signAndSubmit(xdr);
    } finally {
      setContacting(false);
    }
  }

  const isOwnProfile = publicKey === player.wallet;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex gap-6 items-start">
        <div className="w-24 h-24 rounded-full bg-gray-700 overflow-hidden shrink-0">
          {player.ipfsHash && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ipfsUrl(player.ipfsHash)} alt={player.vitals.name} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">{player.vitals.name}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {player.vitals.position} · {player.vitals.region} · Age {player.vitals.age}
          </p>
          <div className="mt-3">
            <span className="inline-block px-3 py-1 bg-brand-green/20 text-brand-green rounded-full text-sm font-medium">
              {PROGRESS_LABELS[player.progressLevel]}
            </span>
          </div>
        </div>
      </div>

      {/* Player Stats */}
      <PlayerStatsCard player={player} />

      {/* Media Gallery */}
      <IPFSMediaGallery ipfsHash={player.ipfsHash} />

      {/* Milestone Timeline */}
      <MilestoneTimeline milestones={player.milestones} />

      {/* Pay to Contact - Only show for scouts with wallet, not for own profile */}
      {/* Note: Subscription check requires contract support - currently shows for any connected wallet */}
      {publicKey && !isOwnProfile && (
        <button
          onClick={handleContact}
          disabled={contacting}
          className="bg-brand-green text-black font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50 w-full"
        >
          {contacting ? "Processing…" : "Pay to Contact (1 XLM)"}
        </button>
      )}
    </div>
  );
}
