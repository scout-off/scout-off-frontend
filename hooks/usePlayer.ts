"use client";
import { useState, useEffect } from "react";
import { getPlayer } from "@/lib/contract";
import type { Player } from "@/types";

export function usePlayer(walletOrId: string | null) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayer = () => {
    if (!walletOrId) return;
    setLoading(true);
    setError(null);
    getPlayer(walletOrId)
      .then(setPlayer)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlayer();
  }, [walletOrId]);

  useEffect(() => {
    const handlePlayerUpdate = (event: CustomEvent) => {
      if (event.detail?.playerId === walletOrId) {
        fetchPlayer();
      }
    };

    window.addEventListener("player-updated", handlePlayerUpdate as EventListener);
    return () => {
      window.removeEventListener("player-updated", handlePlayerUpdate as EventListener);
    };
  }, [walletOrId]);

  return { player, loading, error };
}
