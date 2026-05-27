"use client";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePlayer } from "@/hooks/usePlayer";
import ProgressBar from "@/components/ProgressBar";
import { uploadToIPFS } from "@/lib/ipfs";
import { buildRegisterPlayer } from "@/lib/contract";

export default function PlayerDashboard() {
  const { publicKey, signAndSubmit } = useWallet();
  const { player, loading } = usePlayer(publicKey);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [region, setRegion] = useState("");
  const [age, setAge] = useState("");

  if (!publicKey) {
    return (
      <p className="text-center text-gray-400 mt-20">
        Connect your wallet to access your player dashboard.
      </p>
    );
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !publicKey) return;
    setSubmitting(true);
    try {
      const cid = await uploadToIPFS(file);
      const xdr = await buildRegisterPlayer(
        publicKey,
        { name, position, region, age: Number(age), nationality: "" },
        cid
      );
      await signAndSubmit(xdr);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-center text-gray-400 mt-20">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Player Dashboard</h1>

      {player ? (
        <>
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-white">{player.vitals.name}</h2>
            <p className="text-gray-400 text-sm">
              {player.vitals.position} · {player.vitals.region}
            </p>
            <ProgressBar level={player.progressLevel} />
          </div>

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
                      {new Date(m.timestamp * 1000).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleRegister} className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-white">Create Your Profile</h2>
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" placeholder="Position (e.g. ST, CM)" value={position} onChange={(e) => setPosition(e.target.value)} required />
          <input className="input" placeholder="Region / Country" value={region} onChange={(e) => setRegion(e.target.value)} required />
          <input className="input" type="number" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} required />
          <label className="text-sm text-gray-400">
            Highlight reel / photo
            <input type="file" accept="video/*,image/*" className="mt-1 block" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand-green text-black font-semibold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? "Registering…" : "Register on Stellar"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function PlayerDashboard() {
  return (
    <ErrorBoundary>
      <PlayerDashboardContent />
    </ErrorBoundary>
  );
}
