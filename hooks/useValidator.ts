"use client";
import { useState, useEffect } from "react";
import { buildApproveMilestone, checkIsValidator } from "@/lib/contract";

export function useValidator(publicKey: string | null) {
  const [isValidator, setIsValidator] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setIsValidator(false);
      return;
    }
    setChecking(true);
    checkIsValidator(publicKey)
      .then((result) => setIsValidator(!!result))
      .catch(() => setIsValidator(false))
      .finally(() => setChecking(false));
  }, [publicKey]);

  async function approveMilestone(playerId: string, description: string) {
    if (!publicKey) throw new Error("Wallet not connected");
    return buildApproveMilestone(publicKey, playerId, description);
  }

  return { isValidator, checking, approveMilestone };
}
