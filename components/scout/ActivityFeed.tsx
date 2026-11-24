'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import api from '@/lib/api';
import {
  useContractEvents,
  type FeedEvent as LiveFeedEvent,
  type EventType,
} from '@/hooks/useContractEvents';

interface FeedEvent {
  id: string;
  type: EventType;
  createdAt: string | number;
  payload?: Record<string, any>;
}

const ICONS: Record<EventType, JSX.Element> = {
  player_registered: <span>👤</span>,
  profile_updated: <span>✏️</span>,
  milestone_approved: <span>🏆</span>,
  milestone_revoked: <span>⚠️</span>,
  scout_subscribed: <span>⭐</span>,
  player_contacted: <span>📇</span>,
  trial_offer_logged: <span>📣</span>,
  fees_withdrawn: <span>💰</span>,
  unknown: <span>ℹ️</span>,
};

type Translate = ReturnType<typeof useTranslations>;

/**
 * Human-readable description for a contract event. Message keys live under
 * scout_dashboard.activityFeed.events and are keyed by contract event type so
 * other components can reuse the same translated labels.
 */
function renderDescription(ev: FeedEvent, t: Translate) {
  const p = ev.payload ?? {};
  const player = p.playerName || p.playerId || t('fallback.player');
  const scout = p.scoutName || p.scoutId || t('fallback.scout');
  switch (ev.type) {
    case 'player_registered':
    case 'profile_updated':
    case 'trial_offer_logged':
      return t(`events.${ev.type}`, { player });
    case 'milestone_approved':
      return t('events.milestone_approved', {
        scout,
        milestone: p.milestone || t('fallback.milestone'),
      });
    case 'milestone_revoked':
      return t('events.milestone_revoked', {
        player,
        milestone: p.milestone || p.milestoneId || t('fallback.aMilestone'),
      });
    case 'scout_subscribed':
      return p.tier
        ? t('events.scout_subscribed_tier', { scout, tier: p.tier })
        : t('events.scout_subscribed', { scout });
    case 'player_contacted':
      return t('events.player_contacted', {
        scout,
        player: p.playerName || p.playerId || t('fallback.aPlayer'),
      });
    case 'fees_withdrawn': {
      const amount = p.amountXlm || p.amount;
      return amount
        ? t('events.fees_withdrawn_amount', { amount })
        : t('events.fees_withdrawn');
    }
    default:
      return t('events.unknown');
  }
}

interface ActivityFeedProps {
  scoutId?: string;
}

export default function ActivityFeed({ scoutId }: ActivityFeedProps) {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const t = useTranslations('scout_dashboard.activityFeed');
  const format = useFormatter();

  const { events: liveEvents, isLive } = useContractEvents();

  // Merge live events into the top of the feed, deduplicated.
  useEffect(() => {
    if (liveEvents.length === 0) return;
    setEvents((prev) => {
      const base = prev ?? [];
      const novel = liveEvents.filter((e) => !seenRef.current.has(e.id));
      if (novel.length === 0) return prev;
      novel.forEach((e) => seenRef.current.add(e.id));
      const newIds = new Set(novel.map((e) => e.id));
      setFreshIds((ids) => new Set([...ids, ...newIds]));
      // Remove animation class after 2 s
      setTimeout(
        () =>
          setFreshIds((ids) => {
            const next = new Set(ids);
            newIds.forEach((id) => next.delete(id));
            return next;
          }),
        2000,
      );
      return [...novel, ...base].slice(0, 20);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvents]);

  async function fetchEvents() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (scoutId) {
        params.set('scoutId', scoutId);
      }

      const resp = await api.get(`/events?${params.toString()}`);
      const data = Array.isArray(resp.data) ? resp.data : [];
      const filtered = scoutId
        ? data.filter((event) => {
            const payload = event.payload ?? {};
            return payload.scoutId === scoutId;
          })
        : data;
      setEvents(filtered.slice(0, 20));
    } catch (err) {
      // fail quietly and show no events
      // eslint-disable-next-line no-console
      console.error('Failed to fetch events', err);
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
      <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
        {t('title')}
        {isLive && (
          <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full">
            {t('live')}
          </span>
        )}
      </h2>

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
        <p className="text-sm text-gray-400">{t('empty')}</p>
      )}

      {!loading && events && events.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-800">
          {events.map((ev) => {
            // Accept createdAt as seconds or ISO string
            const ts =
              typeof ev.createdAt === 'number'
                ? ev.createdAt * 1000
                : new Date(ev.createdAt).getTime();
            return (
              <li
                key={ev.id}
                className={`py-3 flex items-start gap-3 transition-colors duration-700${freshIds.has(ev.id) ? ' bg-green-950/40' : ''}`}
              >
                <div className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-gray-900 text-white text-sm">
                  {ICONS[ev.type] ?? 'ℹ️'}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-200">
                    {renderDescription(ev, t)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {format.relativeTime(ts, Date.now())}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
