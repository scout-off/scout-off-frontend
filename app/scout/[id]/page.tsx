"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import ScoutProfileCard from "@/components/scout/ScoutProfileCard";
import ChatThread from "@/components/scout/ChatThread";
import { fetchScoutProfile, fetchScoutContacts } from "@/lib/api";
import type { Scout } from "@/types";

export default function ScoutPublicProfile() {
  const { id } = useParams<{ id: string }>();
  const { publicKey, connect } = useWallet();
  const [scout, setScout] = useState<Scout | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    Promise.all([fetchScoutProfile(id), fetchScoutContacts(id)])
      .then(([profile, contacted]) => {
        setScout(profile as Scout);
        setContacts(contacted as string[]);
      })
      .catch(() => setScout(null))
      .finally(() => setLoading(false));
  }, [id]);

  function handleConnect() {
    if (!publicKey) {
      connect().then(() => setShowChat(true));
    } else {
      setShowChat(true);
    }
  }

  if (loading) return <p className="text-center text-gray-400 mt-20">Loading…</p>;
  if (!scout) return <p className="text-center text-gray-400 mt-20">Scout not found.</p>;

  // Chat room is keyed by scout wallet + connected player wallet
  const roomId = publicKey ? `${scout.wallet}-${publicKey}` : "";

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <ScoutProfileCard scout={scout} />

      {/* Contacted players */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Players Contacted</h2>
        {contacts.length === 0 ? (
          <p className="text-gray-500 text-sm">No players contacted yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contacts.map((playerId) => (
              <li key={playerId} className="text-sm text-gray-300 border-l-2 border-brand-green pl-3 font-mono">
                {playerId}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Trial offers */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Trial Offers Logged</h2>
        {scout.contactedPlayers.length === 0 ? (
          <p className="text-gray-500 text-sm">No trial offers logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {scout.contactedPlayers.map((playerId) => (
              <li key={playerId} className="text-sm text-gray-300 border-l-2 border-gray-600 pl-3 font-mono">
                {playerId}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Connect / Chat */}
      {!showChat ? (
        <button
          onClick={handleConnect}
          className="bg-brand-green text-black font-semibold py-3 rounded-xl hover:opacity-90 transition"
        >
          {publicKey ? "Connect with Scout" : "Connect Wallet to Chat"}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-white">Chat</h2>
          <ChatThread roomId={roomId} senderKey={publicKey!} />
        </div>
      )}
    </div>
  );
}
