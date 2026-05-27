"use client";
import { useState } from "react";
import { useWallet } from "./useWallet";
import { buildLogTrialOffer, getPlayer } from "@/lib/contract";
import { fetchScoutProfile } from "@/lib/api";
import type { Player } from "@/types";

export function useTrialOffer() {
  const { publicKey, signAndSubmit } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logTrialOffer(playerId: string, details: string): Promise<Player> {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    setLoading(true);
    setError(null);

    try {
      // Check if scout has active subscription
      const scout = await fetchScoutProfile(publicKey);
      const now = Date.now();
      if (scout.subscriptionExpiry < now) {
        throw new Error("Subscription expired. Please renew your subscription to log trial offers.");
      }

      // Check if player is already at Level 3
      const currentPlayer = await getPlayer(playerId);
      if (currentPlayer.progressLevel === 3) {
        throw new Error("Player is already at Level 3 (Elite Tier). Cannot log trial offer.");
      }

      // Build and sign the transaction
      const xdr = await buildLogTrialOffer(publicKey, playerId, details);
      await signAndSubmit(xdr);

      // Fetch the updated player data (now at Level 3)
      const updatedPlayer = await getPlayer(playerId);

      // Trigger cache invalidation for usePlayer hook
      // This is done by dispatching a custom event that usePlayer can listen to
      window.dispatchEvent(new CustomEvent("player-updated", { detail: { playerId } }));

      return updatedPlayer as Player;
    } catch (e: any) {
      const errorMessage = e.message || "Failed to log trial offer";
      setError(errorMessage);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { logTrialOffer, loading, error };
}
