'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AutomatedModerationEntry {
  id: string;
  category: string;
  rule: string;
  severity: 'low' | 'medium' | 'high';
  userId: string;
  threadId?: string;
  timestamp: number;
  context: Record<string, unknown>;
}

interface AuditEntry {
  id: number;
  actionType: string;
  adminWallet: string;
  target: string | null;
  amountStroops: number | null;
  txHash: string | null;
  status: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export default function AutomatedModerationLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [filterUserId, setFilterUserId] = useState('');

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/automated-moderation-log');
      if (!res.ok) throw new Error('Failed to load entries');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = entries.filter((entry) => {
    if (filter !== 'all') {
      // Extract severity from the data field
      const severity = entry.data?.severity as string | undefined;
      if (severity !== filter) return false;
    }

    if (filterUserId) {
      const userId = entry.data?.userId as string | undefined;
      if (userId !== filterUserId) return false;
    }

    return true;
  });

  const getSeverityLabel = (severity: string | undefined): string => {
    switch (severity) {
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return 'Unknown';
    }
  };

  const getSeverityColor = (severity: string | undefined): string => {
    switch (severity) {
      case 'high':
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'low':
        return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default:
        return 'text-gray-400 bg-gray-700/30 border-gray-700/50';
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Automated Moderation Log
        </h2>
        <span className="text-sm text-gray-400">
          {entries.length} entries
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Filter severity:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-green"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Filter user:</label>
          <input
            type="text"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            placeholder="User ID..."
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-green w-48"
          />
        </div>

        <button
          onClick={loadEntries}
          className="px-3 py-1.5 rounded-lg bg-brand-green text-black text-sm font-medium hover:opacity-90 transition"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <p className="text-sm text-gray-400">Loading automated moderation entries...</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && filteredEntries.length === 0 && (
        <p className="text-sm text-gray-400">
          No automated moderation entries found.
        </p>
      )}

      {!loading && !error && filteredEntries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-2 pr-4 font-medium text-gray-400">Time</th>
                <th className="py-2 pr-4 font-medium text-gray-400">Severity</th>
                <th className="py-2 pr-4 font-medium text-gray-400">Rule</th>
                <th className="py-2 pr-4 font-medium text-gray-400">User</th>
                <th className="py-2 pr-4 font-medium text-gray-400">Thread</th>
                <th className="py-2 font-medium text-gray-400">Context</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const severity = entry.data?.severity as string | undefined;
                return (
                  <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                    <td className="py-2 pr-4 text-gray-300">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(severity)}`}
                      >
                        {getSeverityLabel(severity)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-200 font-medium">
                      {entry.data?.rule as string | undefined ?? 'Unknown'}
                    </td>
                    <td className="py-2 pr-4 text-gray-300 font-mono">
                      {entry.data?.userId as string | undefined}
                    </td>
                    <td className="py-2 pr-4 text-gray-300 font-mono">
                      {entry.target ?? '-'}
                    </td>
                    <td className="py-2 text-gray-300">
                      <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap max-w-md">
                        {JSON.stringify(entry.data?.context ?? {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-400 pt-2 border-t border-gray-700">
        <p>
          Record automated moderation decisions for admin review. Missing
          entries may indicate a connectivity issue with the chat service.
        </p>
        <Link
          href="/admin"
          className="text-brand-green hover:underline"
        >
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
