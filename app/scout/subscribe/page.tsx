'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
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

function formatExpiry(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function SubscribeContent() {
  const router = useRouter();
  const { subscription, isExpired, subscribe, loading, error } =
    useSubscription();
  const [successMessage, setSuccessMessage] = useState('');
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

  async function handleSubscribe(tier: SubscriptionTier) {
    if (loading) {
      return;
    }

    setSelectedTier(tier);
    setSuccessMessage('');

    try {
      const result = await subscribe(tier);
      const hash = (result as any)?.hash ?? null;
      setTxHash(hash);
      setTxStatus("success");
      setSuccessMessage(`Subscribed to ${tier.toUpperCase()} successfully.`);
      redirectTimer.current = window.setTimeout(() => {
        router.push('/scout');
      }, 1000);
    } catch (err) {
      setTxStatus("error");
      console.error(err);
    } finally {
      setSelectedTier(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
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

        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-100"
          >
            {successMessage}
          </div>
        )}

        <TransactionStatus
          status={txStatus}
          txHash={txHash}
          error={error ?? undefined}
          onHide={() => setTxStatus(null)}
        />

        {error && txStatus !== "error" && (
          <div
            role="status"
            aria-live="assertive"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-100"
          >
            {error}
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {TIERS.map((plan) => {
          const isRecommended = plan.recommended ?? false;
          const isSelected = selectedTier === plan.tier;

          return (
            <div
              key={plan.tier}
              className={`bg-brand-card border rounded-xl p-6 shadow-sm transition ${
                isRecommended
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
                {isRecommended && (
                  <span className="rounded-full bg-brand-green px-3 py-1 text-xs font-semibold uppercase text-black">
                    Recommended
                  </span>
                )}
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
                disabled={loading}
              >
                {loading && isSelected
                  ? 'Processing…'
                  : `Subscribe to ${plan.title}`}
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
