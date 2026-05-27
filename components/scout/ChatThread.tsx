"use client";
import { useEffect, useRef, useState } from "react";
import { fetchChatHistory, postChatMessage } from "@/lib/api";

interface Message {
  sender: string;
  message: string;
  createdAt?: string;
}

interface Props {
  roomId: string;
  senderKey: string;
}

export default function ChatThread({ roomId, senderKey }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChatHistory(roomId).then(setMessages).catch(() => {});
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const msg = await postChatMessage(roomId, text.trim(), senderKey);
      setMessages((prev) => [...prev, msg]);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl flex flex-col h-80">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">No messages yet. Start the conversation.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm max-w-xs rounded-lg px-3 py-2 ${m.sender === senderKey ? "self-end bg-brand-green text-black" : "self-start bg-gray-800 text-gray-200"}`}>
            {m.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="border-t border-gray-800 p-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="bg-brand-green text-black font-semibold px-4 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
