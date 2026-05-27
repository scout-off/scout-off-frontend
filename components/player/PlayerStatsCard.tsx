"use client";
import { useState } from "react";
import type { Player } from "@/types";
import { PROGRESS_LABELS } from "@/types";
import ProgressBar from "@/components/ProgressBar";

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function PlayerStatsCard({ player }: { player: Player }) {
  const { wallet, vitals, ipfsHash, progressLevel, milestones } = player;
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const initials = vitals.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row gap-5">
      {/* Avatar */}
      <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {ipfsHash ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${ipfsHash}`}
            alt={vitals.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-brand-green">{initials}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div>
          <h2 className="text-lg font-semibold text-white">{vitals.name}</h2>
          <p className="text-sm text-gray-400">{vitals.nationality} · Age {vitals.age}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs bg-gray-800 border border-gray-700 text-brand-green rounded-full px-2 py-0.5">
            {vitals.position}
          </span>
          <span className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-full px-2 py-0.5">
            {vitals.region}
          </span>
          <span className="text-xs bg-gray-800 border border-gray-700 text-yellow-400 rounded-full px-2 py-0.5">
            {PROGRESS_LABELS[progressLevel]}
          </span>
        </div>

        <ProgressBar level={progressLevel} />

        <p className="text-sm text-gray-400">
          Milestones: <span className="text-white font-medium">{milestones.length}</span>
        </p>

        {/* Wallet */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="font-mono">{truncate(wallet)}</span>
          <button
            onClick={copy}
            className="text-xs text-brand-green hover:underline"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
