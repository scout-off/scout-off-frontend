'use client';

import { useState } from 'react';
import { blockUser, reportUser, unblockUser } from '@/lib/messaging/moderation';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';

/**
 * Report/Block controls for a message thread. Report captures a reason and
 * routes it to the moderation queue; Block stops further messages and
 * pay-to-contact unlocks from the counterpart, with an unblock option.
 *
 * Blocked state comes from useBlockedUsers, which reconciles against the
 * server's authoritative block list rather than trusting only whatever
 * this browser's localStorage happens to say.
 */
export default function ReportBlockControls({
  threadId,
  counterpartId,
}: {
  threadId: string;
  counterpartId: string;
}) {
  const { isBlocked, refetch: refetchBlockedUsers } = useBlockedUsers();
  const [optimisticBlocked, setOptimisticBlocked] = useState<boolean | null>(
    null,
  );
  const blocked = optimisticBlocked ?? isBlocked(counterpartId);

  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);

  const submitReport = async () => {
    if (!reason.trim()) return;
    await reportUser(threadId, counterpartId, reason.trim());
    setReporting(false);
    setReason('');
    setStatus('Reported. Our moderation team will review this thread.');
  };

  const toggleBlock = async () => {
    const next = !blocked;
    setOptimisticBlocked(next);
    setBlockError(null);
    try {
      if (next) {
        await blockUser(counterpartId);
        setStatus('User blocked. They can no longer message or contact you.');
      } else {
        await unblockUser(counterpartId);
        setStatus('User unblocked.');
      }
      // Kick off a refetch so the server list (and other consumers reading
      // it) stay in sync, but don't wait on it to confirm the optimistic
      // state — the block/unblock call already succeeded.
      refetchBlockedUsers();
    } catch {
      setOptimisticBlocked(!next);
      setBlockError(
        next
          ? 'Could not block this user. Please try again.'
          : 'Could not unblock this user. Please try again.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <button
          className="rounded border px-2 py-1"
          onClick={() => setReporting((v) => !v)}
        >
          Report
        </button>
        <button className="rounded border px-2 py-1" onClick={toggleBlock}>
          {blocked ? 'Unblock' : 'Block'}
        </button>
      </div>

      {reporting && (
        <div className="flex flex-col gap-1">
          <textarea
            className="rounded border px-2 py-1"
            placeholder="Reason for report…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="w-fit rounded bg-red-600 px-2 py-1 text-white"
            onClick={submitReport}
          >
            Submit report
          </button>
        </div>
      )}

      {blocked && <p className="text-gray-400">You have blocked this user.</p>}
      {status && <p className="text-green-600">{status}</p>}
      {blockError && <p className="text-red-600">{blockError}</p>}
    </div>
  );
}
