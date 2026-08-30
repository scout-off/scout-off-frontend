"use client";

import { useWallet } from "@/hooks/useWallet";
import { isBlocked } from "@/lib/messaging/moderation";

interface BlockedStateMessageProps {
  targetId: string;
  targetType: "player" | "scout";
  action?: "contact" | "message" | "view";
}

export default function BlockedStateMessage({ targetId, targetType, action = "contact" }: BlockedStateMessageProps) {
  const { publicKey } = useWallet();

  if (!publicKey) return null;

  const blocked = isBlocked(targetId, publicKey);

  if (!blocked) return null;

  const actionText = {
    contact: "contact this player",
    message: "send a message",
    view: "view this profile",
  }[action];

  return (
    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-center">
      <p className="text-red-400 text-sm mb-2">
        You have blocked this {targetType}. You cannot {actionText}.
      </p>
      <p className="text-gray-400 text-xs mb-3">
        If you believe this was done in error, you can request a review.
      </p>
      <a
        href="mailto:support@scoutoff.io?subject=Block Appeal - ${targetType} ID: ${targetId}"
        className="inline-block text-brand-green text-sm hover:underline"
      >
        Contact Support for Review
      </a>
    </div>
  );
}
