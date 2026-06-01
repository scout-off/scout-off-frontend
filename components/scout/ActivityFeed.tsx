"use client";

import React, { useEffect, useState, useRef } from "react";
import api from "@/lib/api";

type EventType = "player_registered" | "milestone_approved" | "trial_offer_logged";

interface FeedEvent {
  id: string;
  type: EventType;
  createdAt: string | number;
  payload?: Record<string, any>;
}

function timeAgo(ms: number) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const ICONS: Record<EventType, JSX.Element> = {
  player_registered: <span>👤</span>,
  milestone_approved: <span>🏆</span>,
  trial_offer_logged: <span>📣</span>,
};

function renderDescription(ev: FeedEvent) {
  switch (ev.type) {
    case "player_registered": {
      const name = ev.payload?.playerName || ev.payload?.playerId || "Player";
      return <>{name} registered</>;
    }
    case "milestone_approved": {
      const who = ev.payload?.scoutName || ev.payload?.scoutId || "A scout";
      const milestone = ev.payload?.milestone || "milestone";
      return <>{who} approved {milestone}</>;
    }
    case "trial_offer_logged": {
      const player = ev.payload?.playerName || ev.payload?.playerId || "Player";
      return <>{player} received a trial offer</>;
    }
    default:
      return <>Event</>;
  }
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<number | null>(null);

  async function fetchEvents() {
    setLoading(true);
    try {
      // backend should expose an events endpoint returning recent events
      const resp = await api.get("/events?limit=20");
      const data = Array.isArray(resp.data) ? resp.data : [];
      setEvents(data.slice(0, 20));
    } catch (err) {
      // fail quietly and show no events
      // eslint-disable-next-line no-console
      console.error("Failed to fetch events", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
    intervalRef.current = window.setInterval(fetchEvents, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-5">
      <h2 className="text-lg font-semibold text-white mb-3">Activity Feed</h2>

      {loading && (
        <ul className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 bg-gray-700 rounded-full animate-pulse" />
              <div className="flex-1">
                <div className="h-3 bg-gray-700 rounded w-3/4 animate-pulse" />
                <div className="h-2 bg-gray-700 rounded w-1/4 mt-2 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && (!events || events.length === 0) && (
        <p className="text-sm text-gray-400">No recent activity.</p>
      )}

      {!loading && events && events.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-800">
          {events.map((ev) => {
            // Accept createdAt as seconds or ISO string
            const ts = typeof ev.createdAt === "number"
              ? ev.createdAt * 1000
              : new Date(ev.createdAt).getTime();
            return (
              <li key={ev.id} className="py-3 flex items-start gap-3">
                <div className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-gray-900 text-white text-sm">
                  {ICONS[ev.type] ?? "ℹ️"}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-200">{renderDescription(ev)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{timeAgo(ts)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
