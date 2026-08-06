'use client';
import { useEffect, useState } from 'react';
import { fetchFraudFlags } from '@/lib/api';
import EmptyState from '@/components/ui/EmptyState';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import type { FraudFlag, FraudFlagSeverity } from '@/types';

const SEVERITY_STYLES: Record<FraudFlagSeverity, string> = {
  high: 'border-red-500 bg-red-950/30 text-red-400',
  medium: 'border-yellow-500 bg-yellow-950/30 text-yellow-400',
  low: 'border-gray-600 bg-gray-900 text-gray-400',
};

const CATEGORY_LABELS: Record<FraudFlag['category'], string> = {
  referral: 'Referral',
  pay_to_contact: 'Pay-to-Contact',
};

function SeverityBadge({ severity }: { severity: FraudFlagSeverity }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

function FlagCard({ flag }: { flag: FraudFlag }) {
  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={flag.severity} />
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          {CATEGORY_LABELS[flag.category]}
        </span>
        <span className="text-xs text-gray-600 font-mono">
          {flag.heuristic}
        </span>
      </div>

      <p className="text-sm text-gray-200">{flag.reason}</p>

      <div className="flex flex-wrap gap-2">
        {flag.wallets.map((wallet, i) => (
          <TruncatedAddress
            key={`${wallet}-${i}`}
            address={wallet}
            className="text-gray-400"
          />
        ))}
      </div>

      <details className="text-xs text-gray-400">
        <summary className="cursor-pointer select-none hover:text-gray-300">
          Evidence
        </summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(flag.evidence).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-gray-600">{key}</dt>
              <dd className="text-gray-300 break-all">
                {Array.isArray(value) ? value.join(', ') : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </li>
  );
}

/**
 * Surfaces the output of lib/fraudDetection.ts to admins. Alert-only by
 * design (see docs/fraud-detection.md) — nothing here blocks or throttles
 * anything; it's a worklist for investigation, not an enforcement action.
 */
export default function FraudFlagsPanel() {
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchFraudFlags()
      .then(({ flags, warnings }) => {
        if (cancelled) return;
        setFlags(flags);
        setWarnings(warnings);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Flagged Activity</h2>
        <p className="text-sm text-gray-400 mt-1">
          Suspicious referral and pay-to-contact patterns detected across all
          wallets. Alert-only — review and investigate manually.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          Failed to load flagged activity.
        </p>
      ) : (
        <>
          {warnings.map((warning) => (
            <p
              key={warning}
              role="status"
              className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800 rounded-md px-3 py-2"
            >
              {warning}
            </p>
          ))}

          {flags.length === 0 ? (
            <EmptyState
              title="No flags"
              description="No suspicious referral or pay-to-contact patterns detected."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {flags.map((flag) => (
                <FlagCard key={flag.id} flag={flag} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
