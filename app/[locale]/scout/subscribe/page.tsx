'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import TransactionStatus from '@/components/ui/TransactionStatus';
import type { TxStatus } from '@/components/ui/TransactionStatus';
import useIsPaused from '@/hooks/useIsPaused';
import { useSubscription } from '@/hooks/useSubscription';
import type { SubscriptionTier } from '@/types';

const TIERS: Array<{
  tier: SubscriptionTier;
  title: string;
  price: string;
  description: string;
  features: string[];
  recommended?: boolean;
}> = [
  {
    tier: 'basic',
    title: 'Basic',
    price: '5 XLM',
    description:
      'Get started with essential scout access and basic player contact capabilities.',
    features: [
      'Browse player profiles',
      'Connect with verified prospects',
      'Pay-to-contact for player details',
    ],
  },
  {
    tier: 'pro',
    title: 'Pro',
    price: '12 XLM',
    description:
      'Recommended for active scouts who want priority access and advanced scouting tools.',
    features: [
      'All Basic features',
      'Priority player discovery',
      'Faster access to contact details',
    ],
    recommended: true,
  },
];

const TIER_ORDER: Record<SubscriptionTier, number> = {
  basic: 0,
  pro: 1,
  elite: 2,
};

function formatExpiry(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function remainingDays(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now() / 1000) / 86400));
}

function SubscribeContent() {
  const router = useRouter();
  const isPaused = useIsPaused();
  const { subscription, isExpired, subscribe, loading, error } =
    useSubscription();
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [feePaid, setFeePaid] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(
    null,
  );
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const statusMessage = useMemo(() => {
    if (loading && !subscription) {
      return 'Loading your current subscription...';
    }

    if (!subscription) {
      return 'No active subscription found.';
    }

    if (isExpired) {
      return `Your ${subscription.tier.toUpperCase()} subscription expired on ${formatExpiry(subscription.expiresAt)}.`;
    }

    return `Current subscription: ${subscription.tier.toUpperCase()} — active until ${formatExpiry(subscription.expiresAt)}.`;
  }, [subscription, isExpired, loading]);

  function getCtaLabel(
    planTier: SubscriptionTier,
    isProcessing: boolean,
  ): string {
    if (isProcessing) return 'Processing…';

    if (!subscription || isExpired) {
      // Expired: same tier = Renew, higher tier = Upgrade, no sub = Subscribe
      if (subscription && isExpired) {
        if (planTier === subscription.tier) return 'Renew';
        if (TIER_ORDER[planTier] > TIER_ORDER[subscription.tier])
          return 'Upgrade';
      }
      return 'Subscribe';
    }

    // Active subscription
    if (planTier === subscription.tier) return 'Renew';
    if (TIER_ORDER[planTier] > TIER_ORDER[subscription.tier]) return 'Upgrade';
    return 'Subscribe';
  }

  async function handleSubscribe(tier: SubscriptionTier) {
    if (loading || isPaused) {
      return;
    }

    setSelectedTier(tier);
    setTxStatus('pending');
    setFeePaid(undefined);
    setSuccessMessage(null);

    try {
      await subscribe(tier);
      const plan = TIERS.find((p) => p.tier === tier);
      // price is like "5 XLM" — strip the " XLM" suffix for feePaid
      setFeePaid(plan ? plan.price.replace(' XLM', '') : undefined);
      setSuccessMessage(`Subscribed to ${tier} successfully`);
      setTxStatus('success');
      redirectTimer.current = window.setTimeout(() => {
        router.push('/scout');
      }, 8000);
    } catch (err) {
      setTxStatus('error');
      console.error(err);
    } finally {
      setSelectedTier(null);
    }
  }

  const hasActiveSub = subscription && !isExpired;

  return (
    <div className="flex flex-col gap-8">
      {/* Active subscription banner */}
      {hasActiveSub && (
        <div
          role="status"
          aria-label="Active subscription"
          className="rounded-xl border border-brand-green/40 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),_transparent)] px-5 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-green px-3 py-1 text-xs font-semibold uppercase text-black">
              {subscription.tier}
            </span>
            <span className="text-sm text-gray-200">
              Active until{' '}
              <strong className="text-white">
                {formatExpiry(subscription.expiresAt)}
              </strong>
            </span>
          </div>
          <span className="text-sm text-emerald-400 font-medium">
            {remainingDays(subscription.expiresAt)} days remaining
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">
                Scout Subscription
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Upgrade your access and unlock better scouting capabilities.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-900 border border-gray-700 px-4 py-3 text-sm text-gray-200">
              {statusMessage}
            </div>
          </div>
        </div>

        {error && !txStatus && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {successMessage && txStatus === 'success' && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-brand-green"
          >
            {successMessage}
          </p>
        )}
        {txStatus && (
          <TransactionStatus
            status={txStatus}
            feePaid={feePaid}
            error={error ?? undefined}
            onHide={() => {
              setTxStatus(null);
              setSuccessMessage(null);
            }}
          />
        )}
      </div>

      {subscription && !isExpired && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-brand-green/40 bg-brand-green/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div>
            <span className="text-xs uppercase tracking-widest text-brand-green font-semibold">
              Active Subscription
            </span>
            <p className="text-white font-semibold mt-0.5">
              {subscription.tier.charAt(0).toUpperCase() +
                subscription.tier.slice(1)}{' '}
              Plan
            </p>
          </div>
          <div className="text-sm text-gray-300">
            Expires{' '}
            <span className="text-white font-medium">
              {formatExpiry(subscription.expiresAt)}
            </span>{' '}
            &middot;{' '}
            <span className="text-brand-green font-medium">
              {remainingDays(subscription.expiresAt)} day
              {remainingDays(subscription.expiresAt) !== 1 ? 's' : ''} remaining
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {TIERS.map((plan) => {
          const isRecommended = plan.recommended ?? false;
          const isSelected = selectedTier === plan.tier;
          const isActiveTier = hasActiveSub && subscription.tier === plan.tier;
          const ctaLabel = getCtaLabel(plan.tier, loading && isSelected);

          return (
            <div
              key={plan.tier}
              className={`bg-brand-card border rounded-xl p-6 shadow-sm transition ${
                isActiveTier
                  ? 'border-brand-green ring-2 ring-brand-green/50 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent)]'
                  : isRecommended
                    ? 'border-brand-green bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent)]'
                    : 'border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-gray-400">
                    {plan.title}
                  </p>
                  <p className="text-4xl font-bold text-white mt-3">
                    {plan.price}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {isActiveTier && (
                    <span className="rounded-full bg-brand-green px-3 py-1 text-xs font-semibold uppercase text-black">
                      Current Plan
                    </span>
                  )}
                  {!isActiveTier && isRecommended && (
                    <span className="rounded-full bg-brand-green px-3 py-1 text-xs font-semibold uppercase text-black">
                      Recommended
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-300">{plan.description}</p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-3 text-sm text-gray-300"
                  >
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-green" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-8 w-full"
                isLoading={loading && isSelected}
                onClick={() => handleSubscribe(plan.tier)}
                disabled={loading || isPaused}
                title={isPaused ? 'Contract is currently paused' : undefined}
              >
                {ctaLabel}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ScoutSubscribePage() {
  return (
    <ErrorBoundary>
      <SubscribeContent />
    </ErrorBoundary>
  );
}
