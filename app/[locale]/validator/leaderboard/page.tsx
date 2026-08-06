'use client';

import Link from 'next/link';
import { useValidatorLeaderboard } from '@/hooks/useValidatorLeaderboard';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import EmptyState from '@/components/ui/EmptyState';

export default function ValidatorLeaderboardPage() {
  const { entries, loading, error } = useValidatorLeaderboard();

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Validator Leaderboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Validators ranked by total approved milestones. Anyone can view this
          page — no wallet connection required.
        </p>
      </div>

      {loading && (
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-14 rounded-lg bg-gray-800/50 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
          <p className="text-red-400 text-sm">
            Could not load the validator leaderboard. Please try again later.
          </p>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
          <EmptyState
            title="No validators yet"
            description="Once validators are added to the contract, they'll appear here ranked by approvals."
          />
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="bg-brand-card border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">
              Validators ranked by approval count
            </caption>
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th scope="col" className="py-3 pl-6 pr-4 font-medium">
                  Rank
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Validator
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Approvals
                </th>
                <th scope="col" className="py-3 pr-6 font-medium">
                  Reputation Score
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.address}
                  className="border-b border-gray-800/60 last:border-0"
                >
                  <td className="py-3 pl-6 pr-4 text-gray-400 font-mono">
                    {i + 1}
                  </td>
                  <td className="py-3 pr-4">
                    {entry.isAcademy ? (
                      <span className="text-white font-medium">
                        {entry.displayName}
                      </span>
                    ) : (
                      <TruncatedAddress
                        address={entry.address}
                        className="text-white"
                      />
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-300">
                    {entry.approvalCount !== null ? entry.approvalCount : '—'}
                  </td>
                  <td className="py-3 pr-6 text-gray-300">
                    {entry.approvalCount !== null
                      ? entry.approvalCount
                      : 'Unavailable'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link
        href="/validator"
        className="self-start text-sm text-gray-400 hover:text-white transition"
      >
        ← Back to Validator Dashboard
      </Link>
    </div>
  );
}
