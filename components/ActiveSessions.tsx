'use client';

import { useCallback, useEffect, useState } from 'react';
import { Laptop, ShieldCheck } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import type { ActiveSessionSummary } from '@/app/api/auth/sessions/route';

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

/**
 * "Active sessions" view (issue #1187) — every currently-active server-side
 * session for the connected wallet (see lib/sessionStore.ts, #1179), with a
 * per-session revoke action. Complements the blunter "log out of all
 * devices" action already on this page: this lets a user remove one
 * compromised or stale device without disturbing the rest.
 *
 * Session metadata shown here is scoped deliberately narrow — a coarse
 * browser/OS label (lib/userAgentLabel.ts) plus login/last-active times.
 * No IP address or geolocation (precise or coarse) is collected or
 * displayed anywhere in this flow.
 */
export default function ActiveSessions() {
  const { isAuthenticated, disconnect } = useWallet();
  const { show } = useToast();
  const [sessions, setSessions] = useState<ActiveSessionSummary[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/sessions');
      if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`);
      const body = await res.json();
      setSessions(body.sessions ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const handleRevoke = async (session: ActiveSessionSummary) => {
    if (session.isCurrent) {
      const confirmed = window.confirm(
        'This is your current session. Revoking it will log you out immediately. Continue?',
      );
      if (!confirmed) return;
    }

    setRevokingId(session.id);
    try {
      const res = await fetch(`/api/auth/sessions/${session.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to revoke session: ${res.status}`);

      if (session.isCurrent) {
        disconnect();
        show({ message: 'Session revoked — you have been logged out', variant: 'success', duration: 6000 });
        return;
      }

      setSessions((prev) => prev?.filter((s) => s.id !== session.id) ?? null);
      show({ message: 'Session revoked', variant: 'success', duration: 5000 });
    } catch {
      show({ message: 'Failed to revoke session', variant: 'error', duration: 6000 });
    } finally {
      setRevokingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <p className="mt-4 text-xs text-gray-500">
        Connect your wallet to view active sessions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <p className="text-sm text-gray-400">Loading sessions…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          Failed to load active sessions.
        </p>
      ) : !sessions || sessions.length === 0 ? (
        <p className="text-sm text-gray-400">No active sessions found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-gray-400">
                  <Laptop size={16} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {session.deviceLabel}
                    </span>
                    {session.isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand-green/40 bg-brand-green/10 px-2 py-0.5 text-xs font-semibold text-brand-green">
                        <ShieldCheck size={11} aria-hidden="true" />
                        This device
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Signed in {formatTimestamp(session.createdAt)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Last active {formatTimestamp(session.lastSeenAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(session)}
                disabled={revokingId === session.id}
                className="shrink-0 self-start rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed sm:self-center"
              >
                {revokingId === session.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
