"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

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
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observerRef.current.observe(containerRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const isVideo = cid.endsWith(".mp4") || cid.endsWith(".webm");
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
          poster={mediaUrl.replace(/\.(mp4|webm)$/, ".jpg")}
          controls
          loading="lazy"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isVisible && isPlaying && (
            <source src={mediaUrl} type={`video/${mediaUrl.split(".").pop()}`} />
          )}
        </video>
        {!isPlaying && (
          <button
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition"
          >
            <div className="w-16 h-16 rounded-full bg-brand-green/80 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-black ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
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
    <div ref={containerRef} className="aspect-square bg-gray-800 rounded-xl overflow-hidden relative">
      <Image
        src={mediaUrl}
        alt={`IPFS media ${cid}`}
        fill
        className="object-cover"
        loading="lazy"
        unoptimized
      />
    </div>
  );
}
