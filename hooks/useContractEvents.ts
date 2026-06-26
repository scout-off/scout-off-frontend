'use client';

import { useEffect, useRef, useState } from 'react';

type EventType =
  | 'player_registered'
  | 'milestone_approved'
  | 'trial_offer_logged';

export interface FeedEvent {
  id: string;
  type: EventType;
  createdAt: string | number;
  payload?: Record<string, unknown>;
}

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const POLL_INTERVAL = 30_000;

/** Map a raw Horizon operation record to the FeedEvent schema. */
function toFeedEvent(op: Record<string, unknown>): FeedEvent | null {
  const raw = op as {
    id?: string;
    type?: string;
    created_at?: string;
    transaction_hash?: string;
    [key: string]: unknown;
  };
  if (!raw.id) return null;

  // Derive a FeedEvent type from the Horizon operation type string.
  let type: EventType;
  switch (raw.type) {
    case 'invoke_host_function':
      // Heuristic: inspect function name hints if present, fall back to milestone_approved
      if (String(raw.function ?? '').includes('register')) {
        type = 'player_registered';
      } else if (String(raw.function ?? '').includes('trial')) {
        type = 'trial_offer_logged';
      } else {
        type = 'milestone_approved';
      }
      break;
    default:
      return null; // Skip non-contract operations
  }

  return {
    id: String(raw.id),
    type,
    createdAt: raw.created_at ?? new Date().toISOString(),
    payload: { txHash: raw.transaction_hash },
  };
}

async function fetchOperations(
  cursor?: string,
): Promise<{ events: FeedEvent[]; nextCursor: string }> {
  const params = new URLSearchParams({ order: 'desc', limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const url = `${HORIZON_URL}/accounts/${CONTRACT_ID}/operations?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Horizon ${resp.status}`);
  const json = await resp.json();
  const records: Record<string, unknown>[] = json?._embedded?.records ?? [];
  const nextCursor: string =
    records.length > 0 ? String((records[0] as { paging_token?: unknown }).paging_token ?? '') : (cursor ?? '');
  const events = records.flatMap((r) => {
    const ev = toFeedEvent(r);
    return ev ? [ev] : [];
  });
  return { events, nextCursor };
}

export function useContractEvents(contractId?: string) {
  const contract = contractId ?? CONTRACT_ID;
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const cursorRef = useRef<string>('now');

  /** Prepend genuinely new events, newest first. */
  function mergeEvents(incoming: FeedEvent[]) {
    const novel = incoming.filter((e) => !seenRef.current.has(e.id));
    if (novel.length === 0) return;
    novel.forEach((e) => seenRef.current.add(e.id));
    setEvents((prev) => [...novel, ...prev].slice(0, 50));
  }

  useEffect(() => {
    if (!contract) return;

    // ── SSE path ────────────────────────────────────────────────────────────
    if (typeof EventSource !== 'undefined') {
      const url = `${HORIZON_URL}/accounts/${contract}/operations?cursor=now`;
      const es = new EventSource(url);

      es.addEventListener('message', (ev) => {
        try {
          const op = JSON.parse(ev.data) as Record<string, unknown>;
          const feedEv = toFeedEvent(op);
          if (feedEv) mergeEvents([feedEv]);
        } catch {
          // malformed frame — ignore
        }
      });

      es.addEventListener('open', () => setIsLive(true));
      es.addEventListener('error', () => setIsLive(false));

      return () => {
        es.close();
        setIsLive(false);
      };
    }

    // ── Polling fallback ────────────────────────────────────────────────────
    let cancelled = false;

    async function poll() {
      try {
        const { events: incoming, nextCursor } = await fetchOperations(
          cursorRef.current === 'now' ? undefined : cursorRef.current,
        );
        if (!cancelled) {
          cursorRef.current = nextCursor;
          mergeEvents(incoming);
        }
      } catch {
        // network errors — silent
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  return { events, isLive };
}
