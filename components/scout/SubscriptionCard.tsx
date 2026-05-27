"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";

type BadgeVariant = "level0" | "level1" | "level2" | "level3" | "position" | "region";

function formatExpiry(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function calculateDaysRemaining(expiresAtSeconds: number): number {
  const now = Date.now() / 1000;
  const daysLeft = Math.ceil((expiresAtSeconds - now) / (24 * 60 * 60));
  return Math.max(0, daysLeft);
}

function getStatusBadge(
  isExpired: boolean,
  daysRemaining: number
): { variant: BadgeVariant; label: string; className?: string } {
  if (isExpired) {
    return {
      variant: "level0",
      label: "Expired",
      className: "bg-red-100 text-red-800",
    };
  }

  if (daysRemaining <= 7) {
    const dayText = daysRemaining === 1 ? "day" : "days";
    return {
      variant: "level2",
      label: `${daysRemaining} ${dayText} left`,
    };
  }

  return {
    variant: "level3",
    label: "Active",
  };
}

const TIER_DISPLAY_NAMES: Record<string, string> = {
  basic: "Basic",
  pro: "Pro",
  elite: "Elite",
};

function SubscriptionCardComponent() {
  const { subscription, isExpired, loading, error } = useSubscription();

  const statusInfo = useMemo(() => {
    if (!subscription) {
      return null;
    }

    const daysRemaining = calculateDaysRemaining(subscription.expiresAt);
    return {
      daysRemaining,
      expiryDate: formatExpiry(subscription.expiresAt),
      badge: getStatusBadge(isExpired, daysRemaining),
    };
  }, [subscription, isExpired]);

  if (loading) {
    return (
      <div
        className="bg-brand-card border border-gray-800 rounded-xl p-6 flex items-center justify-center"
        role="status"
        aria-label="Loading subscription data"
      >
        <Spinner size="md" />
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div
        className="bg-brand-card border border-gray-800 rounded-xl p-6"
        role="alert"
      >
        <p className="text-gray-300 text-sm">
          {error || "Unable to load subscription information"}
        </p>
      </div>
    );
  }

  const tierDisplayName = TIER_DISPLAY_NAMES[subscription.tier] ?? subscription.tier;

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      {/* Header with tier and status badge */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-white text-lg">{tierDisplayName}</h3>
          <p className="text-xs text-gray-400">Subscription</p>
        </div>
        {statusInfo && (
          <Badge
            variant={statusInfo.badge.variant}
            label={statusInfo.badge.label}
            size="sm"
            className={statusInfo.badge.className}
            aria-live="polite"
          />
        )}
      </div>

      {/* Expiry info */}
      <div className="flex flex-col gap-2 py-2 border-t border-gray-700">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Expires</span>
          <span className="text-sm font-medium text-white">
            {statusInfo?.expiryDate ?? "—"}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Days Remaining</span>
          <span
            className={`text-sm font-medium ${
              isExpired ? "text-red-400" : "text-brand-green"
            }`}
          >
            {statusInfo?.daysRemaining ?? 0}
          </span>
        </div>
      </div>

      {/* Renew button */}
      <Link
        href="/scout/subscribe"
        className="text-center text-sm text-white bg-brand-green hover:opacity-90 rounded-lg py-2.5 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Renew
      </Link>
    </div>
  );
}

export default memo(SubscriptionCardComponent);
