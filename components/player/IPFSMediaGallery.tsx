'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useVideoPosterFrame } from '@/hooks/useVideoPosterFrame';
import { getMediaProxyUrl } from '@/lib/mediaUrl';
import {
  useIPFSVideoMSE,
  isMSESupported as mseAvailable,
} from '@/hooks/useIPFSVideoMSE';
import MediaReportButton from './MediaReportButton';

/**
 * 10×10 gray WebP encoded as base64.
 * Used as the blur placeholder while the real IPFS image loads.
 * Generating this inline avoids a network round-trip for the placeholder,
 * which is especially important on low-bandwidth connections.
 */
const BLUR_DATA_URL =
  'data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoKAAoAAUAmJbACdAEO/gHOAAD++Wn//////////8AAAA==';

const MAX_PLAYBACK_RETRIES = 3;

/**
 * Budget before we consider playback "stuck" and trigger a failover.
 * The issue specifies 4 s; we use that value here.
 */
const STUCK_PLAYBACK_TIMEOUT_MS = 4_000;

type PlaybackState = 'idle' | 'loading' | 'playing' | 'reconnecting' | 'error';

interface IPFSMediaGalleryProps {
  cids: string[];
  /** Enables the per-item "Report" control and attributes reports to this player. */
  playerId?: string;
}

/** Fetches which of `cids` moderation has removed (issue #1320). */
function useDenylistedCids(cids: string[]): Set<string> {
  const [denylisted, setDenylisted] = useState<Set<string>>(new Set());
  const key = cids.join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/media/denylist?cids=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : { denylisted: [] }))
      .then((body: { denylisted?: string[] }) => {
        if (!cancelled) setDenylisted(new Set(body.denylisted ?? []));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return denylisted;
}

export default function IPFSMediaGallery({
  cids,
  playerId,
}: IPFSMediaGalleryProps) {
  const denylisted = useDenylistedCids(cids);

  if (cids.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cids.map((cid) =>
        denylisted.has(cid) ? (
          <RemovedMediaItem key={cid} />
        ) : (
          <div key={cid} className="relative">
            <IPFSMediaItem cid={cid} />
            {playerId && <MediaReportButton cid={cid} playerId={playerId} />}
          </div>
        ),
      )}
    </div>
  );
}

function RemovedMediaItem() {
  const t = useTranslations('player_profile.mediaGallery');
  return (
    <div
      className="aspect-square bg-gray-800 rounded-xl flex items-center justify-center p-4 text-center"
      role="img"
      aria-label={t('removedLabel')}
    >
      <span className="text-sm text-gray-400">{t('removedText')}</span>
    </div>
  );
}

interface IPFSMediaItemProps {
  cid: string;
}

function IPFSMediaItem({ cid }: IPFSMediaItemProps) {
  const t = useTranslations('player_profile.mediaGallery');
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sourceKey, setSourceKey] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Startup latency tracking — fulfilled when canplay fires.
  const playbackStartTimeRef = useRef<number | null>(null);

  const isVideo = cid.endsWith('.mp4') || cid.endsWith('.webm');
  const videoMime = cid.endsWith('.webm') ? 'video/webm' : 'video/mp4';

  // ── MSE pipeline (mid-stream failover) ────────────────────────────────────
  // The MSE hook drives the video element when MediaSource is available.
  // When MSE is not supported the component degrades to a plain <source> tag
  // with the raced URL supplied by the server-side media proxy. Gateway
  // racing still applies (via the proxy's fetchMediaFromGateways), so startup
  // resilience is preserved regardless of MSE support.
  const mse = useIPFSVideoMSE();
  const useMSE = isVideo && mse.isMSESupported;

  // The URL fed to <video src>:
  //  - MSE path: MediaSource object URL (mse.objectUrl)
  //  - Fallback path: proxy URL with optional retry cache-buster
  const mediaUrl = useMSE
    ? (mse.objectUrl ?? undefined)
    : getMediaProxyUrl(cid, { retry: sourceKey > 0 ? sourceKey : undefined });

  // Poster frame is generated from the proxy URL so the hook's URL is stable
  // and doesn't change whenever the MSE object URL is re-created.
  const proxyUrl = getMediaProxyUrl(cid);
  const generatedPoster = useVideoPosterFrame(proxyUrl, {
    enabled: isVideo && isVisible,
  });

  // ── Intersection observer ─────────────────────────────────────────────────
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observerRef.current?.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (containerRef.current) {
      observerRef.current.observe(containerRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // ── Stuck-playback timer ──────────────────────────────────────────────────
  const clearStuckTimer = useCallback(() => {
    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  }, []);

  const scheduleStuckCheck = useCallback(() => {
    clearStuckTimer();
    stuckTimerRef.current = setTimeout(() => {
      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_PLAYBACK_RETRIES) {
        setPlaybackState('error');
        return;
      }
      setPlaybackState('reconnecting');
      if (useMSE) {
        // MSE path: stop and restart the pipeline so it re-races gateways.
        mse.stop();
        mse.start(cid, videoMime);
      } else {
        setSourceKey((key) => key + 1);
      }
    }, STUCK_PLAYBACK_TIMEOUT_MS);
  }, [clearStuckTimer, useMSE, mse, cid, videoMime]);

  const handlePlaybackError = useCallback(() => {
    clearStuckTimer();
    retryCountRef.current += 1;
    if (retryCountRef.current >= MAX_PLAYBACK_RETRIES) {
      setPlaybackState('error');
      return;
    }
    setPlaybackState('reconnecting');
    if (useMSE) {
      mse.stop();
      mse.start(cid, videoMime);
    } else {
      setSourceKey((key) => key + 1);
    }
  }, [clearStuckTimer, useMSE, mse, cid, videoMime]);

  const handleManualRetry = useCallback(() => {
    clearStuckTimer();
    retryCountRef.current = 0;
    playbackStartTimeRef.current = performance.now();
    setPlaybackState('loading');
    if (useMSE) {
      mse.stop();
      mse.start(cid, videoMime);
    } else {
      setSourceKey((key) => key + 1);
    }
  }, [clearStuckTimer, useMSE, mse, cid, videoMime]);

  // ── Video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible || !isPlaying) return;

    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () => {
      setPlaybackState('loading');
      scheduleStuckCheck();
    };
    const onStalled = () => scheduleStuckCheck();
    const onPlaying = () => {
      clearStuckTimer();
      retryCountRef.current = 0;
      setPlaybackState('playing');
    };
    const onCanPlay = () => {
      clearStuckTimer();
      setPlaybackState('playing');

      if (playbackStartTimeRef.current !== null) {
        const latencyMs = performance.now() - playbackStartTimeRef.current;
        // Emit to performance infrastructure; harmless if no listener.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ipfs:canplay', {
              detail: { cid, latencyMs },
            }),
          );
        }
        playbackStartTimeRef.current = null;
      }
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', handlePlaybackError);

    return () => {
      clearStuckTimer();
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', handlePlaybackError);
    };
  }, [
    isVisible,
    isPlaying,
    sourceKey,
    clearStuckTimer,
    scheduleStuckCheck,
    handlePlaybackError,
    cid,
  ]);

  // ── MSE state → PlaybackState bridge ─────────────────────────────────────
  useEffect(() => {
    if (!useMSE) return;
    if (mse.state === 'recovering') setPlaybackState('reconnecting');
    else if (mse.state === 'error') setPlaybackState('error');
    else if (mse.state === 'buffering' || mse.state === 'resolving')
      setPlaybackState('loading');
  }, [useMSE, mse.state]);

  // ── Playback start (non-MSE path) ─────────────────────────────────────────
  useEffect(() => {
    if (!isVisible || !isPlaying) return;
    if (useMSE) return; // MSE pipeline controls its own fetch loop.

    const video = videoRef.current;
    if (!video) return;

    video.load();
    video.play().catch(() => {});
  }, [isVisible, isPlaying, mediaUrl, sourceKey, useMSE]);

  // ── MSE pipeline start ────────────────────────────────────────────────────
  useEffect(() => {
    if (!useMSE || !isVisible || !isPlaying) return;

    playbackStartTimeRef.current = performance.now();
    mse.start(cid, videoMime);

    return () => {
      mse.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMSE, isVisible, isPlaying, cid, videoMime]);

  // Assign the MSE object URL to the video element when it changes.
  useEffect(() => {
    if (!useMSE) return;
    const video = videoRef.current;
    if (!video || !mse.objectUrl) return;

    video.src = mse.objectUrl;
    video.load();
    video.play().catch(() => {});
  }, [useMSE, mse.objectUrl]);

  if (isVideo) {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-gray-800 rounded-xl overflow-hidden relative"
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          poster={generatedPoster ?? undefined}
          controls
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {/*
           * MSE path: src is set imperatively via videoRef.current.src above
           * when mse.objectUrl is available. The <source> tag is intentionally
           * omitted in that path — setting both src and <source> is undefined
           * behaviour per the HTML spec.
           *
           * Non-MSE / graceful-degradation path: render a <source> element
           * pointing at the media proxy. The proxy itself races all gateways
           * concurrently server-side (lib/mediaProxyGateway.ts), so the
           * "startup-time gateway racing" requirement is still met even when
           * MSE is not available on the client.
           */}
          {!useMSE && isVisible && isPlaying && (
            <source key={sourceKey} src={mediaUrl} type={videoMime} />
          )}
        </video>
        {!isPlaying && (
          <button
            onClick={() => {
              playbackStartTimeRef.current = performance.now();
              setIsPlaying(true);
              setPlaybackState('loading');
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition"
            aria-label={t('playVideo')}
          >
            <div className="w-16 h-16 rounded-full bg-brand-green/80 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-black ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
        {isPlaying && playbackState === 'reconnecting' && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none"
            role="status"
            aria-live="polite"
          >
            <span className="text-white text-sm font-medium">
              {t('reconnecting')}
            </span>
          </div>
        )}
        {isPlaying && playbackState === 'error' && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            role="alert"
          >
            <button
              type="button"
              onClick={handleManualRetry}
              className="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-black hover:bg-brand-green/90"
            >
              {t('unavailableRetry')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="aspect-square bg-gray-800 rounded-xl overflow-hidden relative"
    >
      {/*
       * next/image with fill layout:
       *   - Avoids CLS: the parent div establishes aspect-square dimensions
       *     before the image loads, so layout is stable.
       *   - placeholder="blur": shows the inline blurDataURL immediately,
       *     giving perceived performance on slow connections.
       *   - sizes: tells the browser which rendered width to expect at each
       *     breakpoint so it downloads the right srcset candidate.
       *   - No unoptimized: Next.js resizes, converts to WebP, and lazy-loads.
       */}
      <Image
        src={getMediaProxyUrl(cid)}
        alt={t('imageAlt', { cid })}
        fill
        className="object-cover"
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
    </div>
  );
}
