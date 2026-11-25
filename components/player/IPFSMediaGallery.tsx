'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useVideoPosterFrame } from '@/hooks/useVideoPosterFrame';
import { getMediaProxyUrl } from '@/lib/mediaUrl';
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
const STUCK_PLAYBACK_TIMEOUT_MS = 5000;

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

/**
 * Fetches the HLS master playlist URL for each original CID (issue #1674).
 * CIDs without a completed rendition ladder are omitted so the player falls
 * back to the original file.
 */
function useHlsRenditions(cids: string[]): Record<string, string> {
  const [renditions, setRenditions] = useState<Record<string, string>>({});
  const key = cids.join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/media/renditions?cids=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : { renditions: {} }))
      .then((body: { renditions?: Record<string, string> }) => {
        if (!cancelled) setRenditions(body.renditions ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return renditions;
}

/**
 * True when the browser reports Save-Data or a 2g/3g effective connection type.
 * Used to start HLS playback on the lowest rung (issue #1674).
 */
function prefersLowestRung(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === '2g' || conn.effectiveType === '3g';
}

export default function IPFSMediaGallery({
  cids,
  playerId,
}: IPFSMediaGalleryProps) {
  const denylisted = useDenylistedCids(cids);
  const renditions = useHlsRenditions(cids);

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
            <IPFSMediaItem cid={cid} hlsUrl={renditions[cid]} />
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
  /** HLS master playlist URL when adaptive renditions exist (issue #1674). */
  hlsUrl?: string;
}

function IPFSMediaItem({ cid, hlsUrl }: IPFSMediaItemProps) {
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
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

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

  const isVideo = cid.endsWith('.mp4') || cid.endsWith('.webm');
  const mediaUrl = getMediaProxyUrl(cid, {
    retry: sourceKey > 0 ? sourceKey : undefined,
  });
  const videoMime = cid.endsWith('.webm') ? 'video/webm' : 'video/mp4';

  const generatedPoster = useVideoPosterFrame(mediaUrl, {
    enabled: isVideo && isVisible,
  });

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
      setSourceKey((key) => key + 1);
    }, STUCK_PLAYBACK_TIMEOUT_MS);
  }, [clearStuckTimer]);

  const handlePlaybackError = useCallback(() => {
    clearStuckTimer();
    retryCountRef.current += 1;
    if (retryCountRef.current >= MAX_PLAYBACK_RETRIES) {
      setPlaybackState('error');
      return;
    }
    setPlaybackState('reconnecting');
    setSourceKey((key) => key + 1);
  }, [clearStuckTimer]);

  const handleManualRetry = useCallback(() => {
    clearStuckTimer();
    retryCountRef.current = 0;
    setPlaybackState('loading');
    setSourceKey((key) => key + 1);
  }, [clearStuckTimer]);

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
  ]);

  // Attach HLS playback (issue #1674). Native HLS on Safari, lazy-loaded
  // hls.js elsewhere. Falls back to the original file when no renditions
  // exist or HLS cannot be attached.
  useEffect(() => {
    if (!isVisible || !isPlaying || !isVideo) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    const attachOriginal = () => {
      if (cancelled) return;
      video.src = mediaUrl;
      video.load();
      video.play().catch(() => {});
    };

    if (!hlsUrl) {
      attachOriginal();
      return () => {
        cancelled = true;
      };
    }

    const canPlayNativeHls =
      video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (canPlayNativeHls) {
      video.src = hlsUrl;
      video.load();
      video.play().catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    let hlsInstance: { destroy: () => void } | null = null;

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          attachOriginal();
          return;
        }
        const hls = new Hls({
          startLevel: prefersLowestRung() ? 0 : -1,
          capLevelToPlayerSize: true,
        });
        hlsInstance = hls;
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            hls.destroy();
            hlsRef.current = null;
            attachOriginal();
          }
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
      })
      .catch(() => {
        attachOriginal();
      });

    return () => {
      cancelled = true;
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsRef.current = null;
      }
    };
  }, [isVisible, isPlaying, isVideo, hlsUrl, mediaUrl, sourceKey]);

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
          {isVisible && isPlaying && !hlsUrl && (
            <source key={sourceKey} src={mediaUrl} type={videoMime} />
          )}
        </video>
        {!isPlaying && (
          <button
            onClick={() => {
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-sm text-white">{t('reconnecting')}</span>
          </div>
        )}
        {isPlaying && playbackState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
            <span className="text-sm text-white">{t('playbackError')}</span>
            <button
              onClick={handleManualRetry}
              className="px-3 py-1 rounded bg-brand-green text-black text-sm"
            >
              {t('retry')}
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
      {isVisible && (
        <Image
          src={mediaUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
        />
      )}
    </div>
  );
}
