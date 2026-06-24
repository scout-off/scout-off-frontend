'use client';
import { useMemo, useState } from 'react';
import type { Scout, SubscriptionTier } from '@/types';
import ScoutProfileCard from './ScoutProfileCard';

const TIER_OPTIONS: Array<{ label: string; value: SubscriptionTier | '' }> = [
  { label: 'All tiers', value: '' },
  { label: 'Basic', value: 'basic' },
  { label: 'Pro', value: 'pro' },
  { label: 'Elite', value: 'elite' },
];

export default function ScoutListPanel({ scouts }: { scouts: Scout[] }) {
  const [tierFilter, setTierFilter] = useState<SubscriptionTier | ''>('');

  const filtered = useMemo(
    () =>
      tierFilter
        ? scouts.filter((s) => s.subscriptionTier === tierFilter)
        : scouts,
    [scouts, tierFilter],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400" htmlFor="tier-filter">
          Filter by tier
        </label>
        <select
          id="tier-filter"
          className="input w-36"
          value={tierFilter}
          onChange={(e) =>
            setTierFilter(e.target.value as SubscriptionTier | '')
          }
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No scouts match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((scout) => (
            <ScoutProfileCard key={scout.id} scout={scout} />
          ))}
        </div>
      )}
    </div>
  );
}
