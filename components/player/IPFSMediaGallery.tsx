"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ipfsUrl } from "../../lib/ipfs";
import Spinner from "../ui/Spinner";

type MediaType = "image" | "video" | "unknown";

type ItemState = {
  cid: string;
  url?: string;
  type: MediaType;
  loading: boolean;
  error?: string;
};

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov"];

function extFromUrl(url: string) {
  try {
    const p = new URL(url).pathname;
    const m = p.split(".").pop();
    return m?.toLowerCase();
  } catch {
    return undefined;
  }
}

async function detectType(url: string, signal?: AbortSignal): Promise<MediaType> {
  const ext = extFromUrl(url);
  if (ext) {
    if (IMAGE_EXTS.includes(ext)) return "image";
    if (VIDEO_EXTS.includes(ext)) return "video";
  }

  // Fallback: try HEAD to get content-type
  try {
    const res = await fetch(url, { method: "HEAD", signal });
    if (!res.ok) return "unknown";
    const ct = res.headers.get("content-type") ?? "";
    if (ct.startsWith("image/")) return "image";
    if (ct.startsWith("video/")) return "video";
  } catch (e) {
    if ((e as any)?.name === "AbortError") throw e;
  }
  return "unknown";
}

function ErrorPlaceholder({ cid }: { cid: string }) {
  return (
    <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 p-4 h-full">
      <div className="text-center">
        <div className="mb-2">Unable to load media</div>
        <div className="text-xs">{cid}</div>
      </div>
    </div>
  );
}

export default function IPFSMediaGallery({ cids }: { cids: string[] }) {
  const [items, setItems] = useState<ItemState[]>(() =>
    cids.map((cid) => ({ cid, type: "unknown", loading: true }))
  );

  useEffect(() => {
    const controllers: Record<string, AbortController> = {};
    let mounted = true;

    cids.forEach((cid, idx) => {
      const url = ipfsUrl(cid);
      const ctrl = new AbortController();
      controllers[cid] = ctrl;

      (async () => {
        try {
          const type = await detectType(url, ctrl.signal);
          if (!mounted) return;
          setItems((prev) => {
            const copy = [...prev];
            copy[idx] = { cid, url, type, loading: false };
            return copy;
          });
        } catch (e) {
          if ((e as any)?.name === "AbortError") return;
          if (!mounted) return;
          setItems((prev) => {
            const copy = [...prev];
            copy[idx] = { cid, url, type: "unknown", loading: false, error: "Failed to resolve" };
            return copy;
          });
        }
      })();
    });

    return () => {
      mounted = false;
      Object.values(controllers).forEach((c) => c.abort());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cids)]);

  return (
    <div className="w-full">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <div key={`${item.cid}-${index}`} className="relative rounded overflow-hidden bg-black/5">
            <MediaTile item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaTile({ item }: { item: ItemState }) {
  if (item.loading) {
    return (
      <div className="aspect-square flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (item.error || !item.url) {
    return <div className="aspect-square"><ErrorPlaceholder cid={item.cid} /></div>;
  }

  if (item.type === "image") {
    return (
      <div className="aspect-square relative">
        <div className="relative w-full h-full">
          <Image
            src={item.url!}
            alt={`Player media ${item.cid}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            loading="lazy"
            unoptimized
          />
        </div>
      </div>
    );
  }

  if (item.type === "video") {
    return <VideoTile cid={item.cid} src={item.url!} />;
  }

  return <div className="aspect-square"><ErrorPlaceholder cid={item.cid} /></div>;
}

function VideoTile({ cid, src }: { cid: string; src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.src = src;

    const onLoaded = () => {
      if (!mounted) return;
      setReady(true);
      try {
        // attempt to capture first frame as poster
        const canvas = document.createElement("canvas");
        canvas.width = vid.videoWidth || 320;
        canvas.height = vid.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          vid.currentTime = 0;
          // draw when seeked
          const onSeeked = () => {
            try {
              ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
              const data = canvas.toDataURL("image/png");
              setPoster(data);
            } catch {}
            vid.removeEventListener("seeked", onSeeked);
          };
          vid.addEventListener("seeked", onSeeked);
        }
      } catch {}
    };

    const onError = () => {
      if (!mounted) return;
      setError("Video failed to load");
    };

    vid.addEventListener("loadedmetadata", onLoaded);
    vid.addEventListener("error", onError);

    return () => {
      mounted = false;
      vid.src = "";
      vid.removeAttribute("src");
    };
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.onplay = () => setPlaying(true);
    v.onpause = () => setPlaying(false);
    v.onerror = () => setError("Playback error");
    return () => {
      if (!v) return;
      v.onplay = null;
      v.onpause = null;
      v.onerror = null;
    };
  }, []);

  const handleActivate = async () => {
    setError(null);
    if (!videoRef.current) return;
    try {
      await videoRef.current.play();
    } catch (e) {
      // must be user gesture; show controls
      try {
        videoRef.current.muted = false;
      } catch {}
    }
  };

  if (error) return <div className="aspect-video"><ErrorPlaceholder cid={cid} /></div>;

  return (
    <div className="aspect-video relative bg-black flex items-center justify-center">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
      )}

      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        controls={false}
        playsInline
        preload="metadata"
        poster={poster}
        tabIndex={0}
        aria-label={`Video highlight ${cid}`}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {!playing && (
          <button
            className="pointer-events-auto bg-black/50 text-white rounded-full p-3 focus:outline-none focus:ring-2 focus:ring-offset-2"
            onClick={handleActivate}
            aria-label={`Play video ${cid}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleActivate();
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
