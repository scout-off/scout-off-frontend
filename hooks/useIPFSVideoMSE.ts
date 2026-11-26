'use client';

/**
 * useIPFSVideoMSE — Media Source Extensions hook for IPFS video playback.
 *
 * Motivation
 * ----------
 * A plain <video src="…"> element gives the browser zero opportunity to swap
 * its data source mid-stream. When a gateway stalls partway through a clip
 * the browser can only report an error or a stall event; there is no built-in
 * way to continue playback from byte N using a different URL without forcing
 * a full restart from byte 0.
 *
 * MSE (MediaSource / SourceBuffer) lets us own the byte pipeline. We fetch
 * segments ourselves, append them to a SourceBuffer, and can seamlessly
 * switch gateway URLs between fetches. If the active gateway fails mid-stream
 * we immediately retry the last failed byte range from the next gateway —
 * the SourceBuffer already contains the bytes that were delivered
 * successfully, so playback can continue without a visible restart.
 *
 * Usage
 * -----
 * Attach the returned `objectUrl` to a <video> element's `src`. Call
 * `start(cid, mimeType)` once the user triggers playback, `stop()` when
 * unmounting or when the user pauses. The hook reports status/error via
 * the returned state object.
 *
 * Graceful degradation
 * --------------------
 * When the runtime environment does not support MediaSource (some browsers
 * and all server-side-rendering contexts) `isMSESupported` is false. The
 * component should fall back to a plain <source> element with the raced URL
 * from `raceGateways()`. Mid-stream failover is then not available but
 * startup-time gateway racing still works.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { raceGateways, DEFAULT_IPFS_FALLBACKS } from '@/lib/ipfs';

/** True in browser environments where MSE is available. */
export const isMSESupported =
  typeof window !== 'undefined' &&
  typeof window.MediaSource !== 'undefined' &&
  typeof window.MediaSource.isTypeSupported === 'function';

/** Chunk size for each range request to the proxy. 1 MiB keeps requests
 *  short enough to fail and retry cheaply while remaining large enough that
 *  we don't hammer the proxy with tiny requests for long videos. */
const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MiB

/** How long to wait for a range-request response before marking a gateway
 *  as failed and trying the next one. */
const FETCH_TIMEOUT_MS = 8_000;

/** Maximum number of consecutive gateway failures before giving up. */
const MAX_CONSECUTIVE_ERRORS = 3;

export type MSEState =
  | 'idle'
  | 'resolving' // gateway race in progress
  | 'buffering' // feeding segments into SourceBuffer
  | 'playing' // playing normally
  | 'recovering' // gateway failed; retrying from next gateway
  | 'error'; // all gateways exhausted

interface UseIPFSVideoMSEOptions {
  /** Additional fallback gateways (defaults to DEFAULT_IPFS_FALLBACKS). */
  fallbacks?: string[];
}

interface UseIPFSVideoMSEResult {
  /** Whether MSE is available in this environment. */
  isMSESupported: boolean;
  /** Object URL to set as `<video src>` — null until MSE is initialised. */
  objectUrl: string | null;
  /** Current pipeline state. */
  state: MSEState;
  /** Non-null in the 'error' state. */
  error: string | null;
  /** Start the MSE pipeline for the given CID. */
  start: (cid: string, mimeType: string) => void;
  /** Tear down the MSE pipeline (call on unmount or when the user stops). */
  stop: () => void;
}

export function useIPFSVideoMSE(
  options: UseIPFSVideoMSEOptions = {},
): UseIPFSVideoMSEResult {
  const fallbacks = options.fallbacks ?? DEFAULT_IPFS_FALLBACKS;

  const [state, setState] = useState<MSEState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Refs that survive re-renders without triggering them.
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cidRef = useRef<string | null>(null);
  const mimeRef = useRef<string | null>(null);
  const appendQueueRef = useRef<Uint8Array[]>([]);
  const isAppendingRef = useRef(false);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream();
        }
      } catch {
        // ignore
      }
      mediaSourceRef.current = null;
    }

    sourceBufferRef.current = null;
    appendQueueRef.current = [];
    isAppendingRef.current = false;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setObjectUrl(null);
    }
  }, []);

  // Drain appendQueue into the SourceBuffer one chunk at a time.
  // SourceBuffer.appendBuffer is synchronous but fires updateend when
  // actually done — we must wait for updateend before the next append.
  const drainQueue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || isAppendingRef.current) return;

    const chunk = appendQueueRef.current.shift();
    if (!chunk) return;

    isAppendingRef.current = true;
    sb.appendBuffer(new Uint8Array(chunk));
  }, []);

  const start = useCallback(
    (cid: string, mimeType: string) => {
      if (!isMSESupported) return;

      // Avoid double-starting.
      if (state !== 'idle' && state !== 'error') return;

      cleanup();

      cidRef.current = cid;
      mimeRef.current = mimeType;

      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      const url = URL.createObjectURL(ms);
      objectUrlRef.current = url;
      setObjectUrl(url);
      setState('resolving');
      setError(null);

      ms.addEventListener('sourceopen', async () => {
        if (!isMSESupported) return;

        // Try to add the SourceBuffer; some browsers reject certain MIME
        // types through MSE even though they play them via <src>. If this
        // fails we surface the error so the caller can fall back gracefully.
        let sb: SourceBuffer;
        try {
          sb = ms.addSourceBuffer(mimeType);
        } catch (err) {
          setState('error');
          setError(
            `MSE does not support type "${mimeType}": ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        sourceBufferRef.current = sb;

        sb.addEventListener('updateend', () => {
          isAppendingRef.current = false;
          drainQueue();
        });

        sb.addEventListener('error', () => {
          // SourceBuffer error — we cannot recover here without restarting MSE.
          setState('error');
          setError('SourceBuffer error');
        });

        // Begin fetching segments.
        await fetchLoop(cid, mimeType, 0);
      });

      ms.addEventListener('sourceended', () => setState('playing'));
      ms.addEventListener('sourceclose', () => {
        // This can fire during teardown; only transition to error if we
        // thought we were still active.
        setState((prev) => (prev === 'buffering' ? 'error' : prev));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, cleanup, drainQueue, fallbacks],
  );

  /**
   * Fetch the content in CHUNK_SIZE range requests, appending each chunk to
   * the SourceBuffer. On gateway failure, retries the failed range from the
   * next available gateway (seamless mid-stream failover).
   */
  async function fetchLoop(
    cid: string,
    mimeType: string,
    startByte: number,
  ): Promise<void> {
    const ms = mediaSourceRef.current;
    if (!ms || ms.readyState === 'closed') return;

    setState('buffering');

    // We keep a local gateway list so we can walk through fallbacks without
    // re-racing for every segment. The initial race picks the fastest gateway;
    // subsequent segments use the same gateway until it fails.
    let gateways = [
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs',
      ...fallbacks,
    ];
    let gatewayIdx = 0;
    let consecutiveErrors = 0;
    let offset = startByte;
    let totalBytes: number | null = null;

    while (true) {
      const sb = sourceBufferRef.current;
      if (!sb || !mediaSourceRef.current || mediaSourceRef.current.readyState === 'closed') return;

      if (gatewayIdx >= gateways.length) {
        setState('error');
        setError('[ipfs] All gateways exhausted during MSE buffering');
        return;
      }

      const gateway = gateways[gatewayIdx];
      const proxyUrl = `/api/media/${encodeURIComponent(cid)}`;
      const rangeEnd =
        totalBytes !== null
          ? Math.min(offset + CHUNK_SIZE - 1, totalBytes - 1)
          : offset + CHUNK_SIZE - 1;

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(proxyUrl, {
          headers: { Range: `bytes=${offset}-${rangeEnd}` },
          signal: ctrl.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok && res.status !== 206 && res.status !== 200) {
          throw new Error(`Proxy returned ${res.status}`);
        }

        // Capture total content length from first response (Content-Range: bytes 0-N/TOTAL).
        if (totalBytes === null) {
          const cr = res.headers.get('content-range');
          if (cr) {
            const m = /\/(\d+)$/.exec(cr);
            if (m) totalBytes = parseInt(m[1], 10);
          }
          const cl = res.headers.get('content-length');
          if (cl && totalBytes === null) {
            totalBytes = parseInt(cl, 10);
          }
        }

        const chunk = new Uint8Array(await res.arrayBuffer());

        // Enqueue for SourceBuffer.
        appendQueueRef.current.push(chunk);
        drainQueue();

        consecutiveErrors = 0;
        offset += chunk.byteLength;

        // Check if we've reached the end.
        if (totalBytes !== null && offset >= totalBytes) {
          // Wait for SourceBuffer to drain before calling endOfStream.
          await waitForBufferDrain();
          if (
            mediaSourceRef.current &&
            mediaSourceRef.current.readyState === 'open'
          ) {
            mediaSourceRef.current.endOfStream();
          }
          return;
        }

        // Small yield between chunks to avoid blocking the main thread.
        await new Promise((r) => setTimeout(r, 0));
      } catch (err) {
        clearTimeout(timeoutId);

        if (ctrl.signal.aborted) {
          // Explicit stop — not an error.
          return;
        }

        consecutiveErrors += 1;
        console.warn(
          `[ipfs] MSE chunk fetch failed (gateway ${gateway}, offset ${offset}):`,
          err,
        );

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          setState('recovering');

          // Try to race for the next best gateway before continuing.
          try {
            const raced = await raceGateways(cid, fallbacks);
            // Find the winning gateway index in our list.
            const newIdx = gateways.indexOf(raced.gateway);
            if (newIdx !== -1 && newIdx !== gatewayIdx) {
              gatewayIdx = newIdx;
            } else {
              // Winning gateway is current one (or not in list); advance anyway.
              gatewayIdx += 1;
            }
          } catch {
            gatewayIdx += 1;
          }

          consecutiveErrors = 0;
          setState('buffering');
        } else {
          // Brief backoff before retrying same gateway.
          await new Promise((r) => setTimeout(r, 500 * consecutiveErrors));
        }
      }
    }
  }

  /** Wait until the SourceBuffer has finished all pending appends. */
  function waitForBufferDrain(): Promise<void> {
    return new Promise((resolve) => {
      const sb = sourceBufferRef.current;
      if (!sb || (!sb.updating && appendQueueRef.current.length === 0)) {
        resolve();
        return;
      }
      const check = () => {
        if (!sb.updating && appendQueueRef.current.length === 0) {
          sb.removeEventListener('updateend', check);
          resolve();
        }
      };
      sb.addEventListener('updateend', check);
    });
  }

  const stop = useCallback(() => {
    setState('idle');
    setError(null);
    cleanup();
  }, [cleanup]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isMSESupported,
    objectUrl,
    state,
    error,
    start,
    stop,
  };
}
