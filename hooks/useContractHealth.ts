"use client";
import { useState, useEffect } from "react";
import { getContractHealth } from "@/lib/contract";

export function useContractHealth() {
  const [healthy, setHealthy] = useState(true);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  async function check() {
    try {
      const result = await getContractHealth();
      const isPaused = result?.paused === true;
      setPaused(isPaused);
      setHealthy(true);
    } catch {
      setHealthy(false);
      setPaused(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  return { healthy, paused, loading };
}
