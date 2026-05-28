"use client";
import { useState, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { payToContact, getSubscription, parseContractError } from "@/lib/contract";
import type { ContactDetails } from "@/types";

export function usePayToContact() {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Map contract error codes to user-friendly messages.
   */
  function mapErrorMessage(errorText: string): string {
    const codeMatch = errorText.match(/code\s*[:=]?\s*(\d+)/i);
    if (codeMatch) {
      return parseContractError(Number(codeMatch[1]));
    }
    if (errorText.includes("InsufficientFee")) {
      return parseContractError(7);
    }
    if (errorText.includes("SubscriptionExpired")) {
      return parseContractError(8);
    }
    return errorText || "An error occurred while fetching contact details.";
  }

  const unlock = useCallback(
    async (playerId: string): Promise<ContactDetails> => {
      if (!publicKey) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);

      try {
        // Check subscription status before calling contract
        const subscription = await getSubscription(publicKey);
        const now = Date.now() / 1000;
        if (!subscription || subscription.expiresAt < now) {
          throw new Error("Your subscription has expired. Please renew it to access contact details.");
        }

        // Call the contract function
        const contactDetails = await payToContact(publicKey, playerId);
        return contactDetails;
      } catch (e: any) {
        const friendlyError = mapErrorMessage(e.message);
        setError(friendlyError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey]
  );

  return { unlock, loading, error };
}
