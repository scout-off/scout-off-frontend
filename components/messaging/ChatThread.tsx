'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchThreadMessages,
  sendThreadMessage,
  markThreadRead,
  ChatMessage,
} from '@/lib/messaging/chatApi';

const POLL_INTERVAL_MS = 4000;

/**
 * Chat UI for a scout/player thread once contact has been unlocked via
 * pay-to-contact. Loads persisted history from the chat-history API and
 * polls for new messages so both sides see updates without a page reload.
 */
export default function ChatThread({ threadId }: { threadId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchThreadMessages(threadId);
      setMessages(data);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    loadMessages();
    markThreadRead(threadId).catch(() => {});
    pollRef.current = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [threadId, loadMessages]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    const message = await sendThreadMessage(threadId, body);
    setMessages((prev) => [...prev, message]);
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-400">Loading conversation…</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm"
            >
              {m.body}
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2 border-t p-2">
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Write a message…"
        />
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
