'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchThreadMessages,
  sendThreadMessage,
  ChatMessage,
} from '@/lib/messaging/chatApi';
import { reportThreadRead } from '@/lib/messaging/readReceipts';
import MessageStatus from '@/components/messaging/MessageStatus';

const POLL_INTERVAL_MS = 4000;
/** Cap exponential backoff so a long outage still gets probed occasionally. */
const MAX_BACKOFF_MS = 60_000;

/**
 * Chat UI for a scout/player thread once contact has been unlocked via
 * pay-to-contact. Loads persisted history from the chat-history API and
 * polls for new messages so both sides see updates without a page reload.
 *
 * The data layer is hardened against real-world network conditions:
 *  - a monotonically increasing sequence number plus an AbortController keep
 *    a slow poll response from ever overwriting state produced by a more
 *    recent request;
 *  - a failed poll surfaces a visible error/retry affordance and backs off
 *    exponentially instead of retrying every 4s forever;
 *  - the draft is only cleared once the server confirms the send, so a failed
 *    send never destroys what the user typed and can be retried as-is;
 *  - polling pauses while the document is hidden and refreshes immediately
 *    on visibility return.
 *
 * Delivered/read indicators (`ChatMessage.status`) are rendered on the
 * signed-in user's own messages; pass `currentUserId` (the sender id the
 * backend stamps on this user's messages) to enable them. Without it the
 * status field is intentionally not rendered — we can't know which messages
 * are ours to annotate.
 */
export default function ChatThread({
  threadId,
  currentUserId,
}: {
  threadId: string;
  /** Sender id of the signed-in user; enables delivered/read indicators. */
  currentUserId?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const mountedRef = useRef(true);
  /** Monotonic id for the most recent poll; stale responses compare against it. */
  const pollSeqRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Consecutive poll failures; drives exponential backoff. */
  const failuresRef = useRef(0);
  /** Synchronous in-flight guard so Enter + click can't double-send. */
  const sendingRef = useRef(false);

  const runPoll = useCallback(async () => {
    const seq = ++pollSeqRef.current;

    // Cancel any superseded in-flight request. The seq guard below remains
    // the final arbiter in case a response still lands after the abort.
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    // Schedule the next attempt up front (based on the last outcome) so a
    // hung request never starves the cadence — polls may overlap, and the
    // seq/abort machinery ensures only the newest one wins.
    const failures = failuresRef.current;
    const delay =
      failures === 0
        ? POLL_INTERVAL_MS
        : Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = setTimeout(() => {
      pollTimeoutRef.current = null;
      runPoll();
    }, delay);

    try {
      const data = await fetchThreadMessages(threadId, controller.signal);
      if (seq !== pollSeqRef.current) return; // stale response — drop it
      setMessages(data);
      setPollError(false);
      failuresRef.current = 0;
      setLoading(false);
    } catch {
      if (seq !== pollSeqRef.current) return; // superseded/aborted, not a failure
      failuresRef.current += 1;
      setPollError(true);
      setLoading(false);
    } finally {
      if (pollAbortRef.current === controller) pollAbortRef.current = null;
    }
  }, [threadId]);

  /** Immediate manual retry after a poll failure; resets the backoff clock. */
  const retryPoll = useCallback(() => {
    failuresRef.current = 0;
    runPoll();
  }, [runPoll]);

  /** Broadcast read state (honoring the recipient's read-receipt opt-out). */
  const markRead = useCallback(() => {
    reportThreadRead(threadId).catch(() => {});
  }, [threadId]);

  useEffect(() => {
    mountedRef.current = true;
    runPoll();
    markRead();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Pause: invalidate in-flight work and drop the pending poll.
        pollSeqRef.current += 1;
        pollAbortRef.current?.abort();
        if (pollTimeoutRef.current) {
          clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
      } else {
        // Resume with an immediate refresh.
        runPoll();
        markRead();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      pollSeqRef.current += 1;
      pollAbortRef.current?.abort();
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runPoll, markRead]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendThreadMessage(threadId, body);
      if (mountedRef.current) {
        setMessages((prev) => [...prev, message]);
      }
      // Clear the draft only once the server confirms; if the user kept
      // typing while the request was in flight, keep their newer text.
      setDraft((current) => (current.trim() === body ? '' : current));
    } catch {
      // The draft is deliberately left untouched so the text survives and
      // the same message can be retried without retyping.
      setSendError(
        "Couldn't send your message. Check your connection and try again.",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (loading && !pollError) {
    return (
      <div className="p-4 text-sm text-gray-400">Loading conversation…</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 p-4">
        {pollError && messages.length === 0 ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"
          >
            <p>Couldn&apos;t load the conversation.</p>
            <button
              className="mt-2 rounded bg-red-600 px-3 py-1 text-xs text-white"
              onClick={retryPoll}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {pollError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700"
              >
                <span>Connection lost — retrying…</span>
                <button
                  className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white"
                  onClick={retryPoll}
                >
                  Retry now
                </button>
              </div>
            )}
            {messages.length === 0 ? (
              <p className="text-sm text-gray-400">
                No messages yet. Say hello!
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm"
                >
                  <span className="flex-1">{m.body}</span>
                  {currentUserId && m.senderId === currentUserId && (
                    <MessageStatus status={m.status} />
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
      {sendError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-t border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600"
        >
          <span>{sendError}</span>
          <button
            className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
            onClick={handleSend}
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex gap-2 border-t p-2">
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Write a message…"
          aria-label="Message"
        />
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
