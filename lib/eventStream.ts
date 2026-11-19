import { useEffect, useRef } from 'react';
import { mutate } from 'swr';

/**
 * Keys that must be revalidated when the server signals that the replay gap
 * was too large to stream and the client needs to refetch through REST.
 */
const RESYNC_KEYS = ['/api/events', '/api/milestones', '/api/players'];

export interface EventStreamOptions {
  /** Base URL of the indexer, e.g. `http://localhost:3001`. */
  baseUrl: string;
  /** Optional topic filter forwarded as `?topics=`. */
  topics?: string[];
  /** Optional wallet filter forwarded as `?wallet=`. */
  wallet?: string;
  /** Called for every live or replayed event. */
  onEvent: (event: unknown) => void;
  /** Called when the server asks the client to resync via REST. */
  onResync?: (reason: string) => void;
}

/**
 * Subscribe to the indexer SSE stream, tracking `Last-Event-ID` so that
 * reconnects replay exactly the events the client missed.
 */
export function useEventStream({
  baseUrl,
  topics,
  wallet,
  onEvent,
  onResync,
}: EventStreamOptions): void {
  const lastEventIdRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);

  onEventRef.current = onEvent;
  onResyncRef.current = onResync;

  useEffect(() => {
    const params = new URLSearchParams();
    if (topics && topics.length > 0) params.set('topics', topics.join(','));
    if (wallet) params.set('wallet', wallet);
    const query = params.toString();
    const url = `${baseUrl}/stream${query ? `?${query}` : ''}`;

    let source: EventSource | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      // EventSource cannot set headers, so pass the cursor as a query param;
      // the server also accepts the standard Last-Event-ID header.
      const cursor = lastEventIdRef.current;
      const target = cursor !== null ? `${url}${query ? '&' : '?'}lastEventId=${cursor}` : url;
      source = new EventSource(target);

      source.onmessage = (message) => {
        const id = Number(message.lastEventId);
        if (Number.isInteger(id) && id > 0) {
          lastEventIdRef.current = id;
        }
        try {
          onEventRef.current(JSON.parse(message.data));
        } catch {
          // Ignore malformed payloads rather than tearing down the stream.
        }
      };

      source.addEventListener('resync', (raw) => {
        let reason = 'gap_too_large';
        try {
          const parsed = JSON.parse((raw as MessageEvent).data);
          if (parsed && typeof parsed.reason === 'string') reason = parsed.reason;
        } catch {
          // Fall back to the default reason.
        }
        // The server could not replay the gap; refetch through REST.
        for (const key of RESYNC_KEYS) {
          void mutate(key);
        }
        onResyncRef.current?.(reason);
      });

      source.onerror = () => {
        // Let EventSource retry automatically; the cursor is preserved so the
        // next connection replays from the last delivered id.
      };
    };

    connect();

    return () => {
      closed = true;
      source?.close();
    };
  }, [baseUrl, topics?.join(','), wallet]);
}
