'use client';

import { useState } from 'react';
import {
  blockUser,
  isUserBlocked,
  reportUser,
  unblockUser,
} from '@/lib/messaging/moderation';

/**
 * Report/Block controls for a message thread. Report captures a reason and
 * routes it to the moderation queue; Block stops further messages and
 * pay-to-contact unlocks from the counterpart, with an unblock option.
 */
export default function ReportBlockControls({
  threadId,
  counterpartId,
}: {
  threadId: string;
  counterpartId: string;
}) {
  const [blocked, setBlocked] = useState(() => isUserBlocked(counterpartId));
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submitReport = async () => {
    if (!reason.trim()) return;
    await reportUser(threadId, counterpartId, reason.trim());
    setReporting(false);
    setReason('');
    setStatus('Reported. Our moderation team will review this thread.');
  };

  const toggleBlock = async () => {
    if (blocked) {
      await unblockUser(counterpartId);
      setBlocked(false);
      setStatus('User unblocked.');
    } else {
      await blockUser(counterpartId);
      setBlocked(true);
      setStatus('User blocked. They can no longer message or contact you.');
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
    </div>
  );
}
