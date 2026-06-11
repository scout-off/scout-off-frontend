'use client';
import { memo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Scout } from '@/types';
import { fetchScoutStats, type ScoutStats } from '@/lib/api';

const TIER_STYLES: Record<string, string> = {
  basic: 'bg-gray-700 text-gray-200',
  pro: 'bg-blue-900 text-blue-300',
  elite: 'bg-yellow-900 text-yellow-300',
};

function truncateWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function subscriptionStatus(
  tier: string | undefined,
  expiry: number | undefined,
) {
  if (!tier || !expiry) return null;
  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now) return null;
  return { tier, expiry };
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ScoutProfileCard({ scout }: { scout: Scout }) {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ScoutStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  const sub = subscriptionStatus(
    scout.subscriptionTier,
    scout.subscriptionExpiry,
  );

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(false);
    fetchScoutStats(scout.id)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStatsError(true);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scout.id]);

  const copyWallet = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(scout.wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silent fail
    }
  }, [scout.wallet]);

  return (
    <article
      className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:border-brand-green transition"
      aria-label={`Scout profile for ${scout.name}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-white truncate">{scout.name}</h3>
          {scout.organisation && (
            <p className="text-sm text-gray-400 truncate">
              {scout.organisation}
            </p>
          )}
        </div>
        {sub ? (
          <span
            className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TIER_STYLES[sub.tier] ?? TIER_STYLES.basic}`}
          >
            {sub.tier}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
            No subscription
          </span>
        )}
      </div>

      {/* Wallet */}
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-sm text-gray-400 select-all"
          title={scout.wallet}
        >
          {truncateWallet(scout.wallet)}
        </span>
        <button
          onClick={copyWallet}
          aria-label="Copy wallet address"
          className="text-xs text-brand-green hover:opacity-75 transition shrink-0"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Subscription expiry */}
      {sub ? (
        <p className="text-xs text-gray-500">
          Expires{' '}
          <span className="text-gray-300">{formatDate(sub.expiry)}</span>
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Subscription inactive or expired
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {(['contactedCount', 'trialOffersCount'] as const).map((key) => (
          <div key={key} className="bg-gray-900 rounded-lg p-3 text-center">
            {statsLoading ? (
              <div className="h-6 w-10 mx-auto bg-gray-700 rounded animate-pulse" />
            ) : statsError ? (
              <span className="text-gray-600 text-sm">—</span>
            ) : (
              <span className="text-xl font-bold text-white">
                {stats?.[key] ?? 0}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-0.5">
              {key === 'contactedCount' ? 'Players Contacted' : 'Trial Offers'}
            </p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Link
        href={`/scout/${scout.id}`}
        className="text-center text-sm text-brand-green border border-brand-green rounded-lg py-1.5 hover:bg-brand-green hover:text-black transition"
      >
        View Profile
      </Link>
    </article>
  );
}

export default memo(
  ScoutProfileCard,
  (prev, next) =>
    prev.scout.id === next.scout.id &&
    prev.scout.subscriptionTier === next.scout.subscriptionTier &&
    prev.scout.subscriptionExpiry === next.scout.subscriptionExpiry,
);
