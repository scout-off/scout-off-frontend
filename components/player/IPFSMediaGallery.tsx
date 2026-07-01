'use client';

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';

/**
 * 10×10 gray WebP encoded as base64.
 * Used as the blur placeholder while the real IPFS image loads.
 * Generating this inline avoids a network round-trip for the placeholder,
 * which is especially important on low-bandwidth connections.
 */
const BLUR_DATA_URL =
  'data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoKAAoAAUAmJbACdAEO/gHOAAD++Wn//////////8AAAA==';

interface IPFSMediaGalleryProps {
  cids: string[];
}

export default function IPFSMediaGallery({ cids }: IPFSMediaGalleryProps) {
  if (cids.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cids.map((cid) => (
        <IPFSMediaItem key={cid} cid={cid} />
      ))}
    </div>
  );
}

interface IPFSMediaItemProps {
  cid: string;
}

function IPFSMediaItem({ cid }: IPFSMediaItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const mediaUrl = `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${cid}`;

  if (isVideo) {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-gray-800 rounded-xl overflow-hidden relative"
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          poster={mediaUrl.replace(/\.(mp4|webm)$/, '.jpg')}
          controls
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isVisible && isPlaying && (
            <source
              src={mediaUrl}
              type={`video/${mediaUrl.split('.').pop()}`}
            />
          )}
        </video>
        {!isPlaying && (
          <button
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition"
            aria-label="Play video"
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
        src={mediaUrl}
        alt={`IPFS media ${cid}`}
        fill
        className="object-cover"
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
    </div>
  );
}
