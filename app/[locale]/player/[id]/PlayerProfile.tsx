"use client";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import ProgressBar from "@/components/ProgressBar";
import { buildPayToContact } from "@/lib/contract";
import { ipfsUrl } from "@/lib/ipfs";
import type { Player } from "@/types";

// Client half of the player profile: the parent server component fetches the
// player during SSR (and calls `notFound()` for a missing id, yielding a real
// 404), then hands the data here. Only the wallet/pay interaction stays client.
export default function PlayerProfile({
  player,
  playerId,
}: {
  player: Player;
  playerId: string;
}) {
  const { publicKey, signAndSubmit } = useWallet();
  const [contacting, setContacting] = useState(false);

  async function handleContact() {
    if (!publicKey) return;
    setContacting(true);
    try {
      const xdr = await buildPayToContact(publicKey, playerId);
      await signAndSubmit(xdr);
    } finally {
      setContacting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex gap-6 items-start">
        <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden shrink-0">
          {player.ipfsHash && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ipfsUrl(player.ipfsHash)} alt={player.vitals.name} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{player.vitals.name}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {player.vitals.position} · {player.vitals.region} · Age {player.vitals.age}
          </p>
          <div className="mt-4">
            <ProgressBar level={player.progressLevel} />
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">On-Chain Milestones</h2>
        {player.milestones.length === 0 ? (
          <p className="text-gray-500 text-sm">No milestones recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {player.milestones.map((m) => (
              <li key={m.id} className="text-sm text-gray-300 border-l-2 border-brand-green pl-3">
                {m.description}
                <span className="block text-xs text-gray-500 mt-0.5">
                  Validator: {m.validator.slice(0, 8)}… · {new Date(m.timestamp * 1000).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pay to contact */}
      {publicKey && (
        <button
          onClick={handleContact}
          disabled={contacting}
          className="bg-brand-green text-black font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {contacting ? "Processing…" : "Pay to Contact (1 XLM)"}
        </button>
      )}
    </div>
  );
}
