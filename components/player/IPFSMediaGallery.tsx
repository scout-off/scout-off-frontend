"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ipfsUrl } from "@/lib/ipfs";

export type MediaKind = "image" | "video" | "unsupported" | "unknown";
export type MediaStatus = "loading" | "ready" | "error";

interface IPFSMediaGalleryProps {
  cids: string[];
}

interface MediaItemState {
  cid: string;
  url: string;
  kind: MediaKind;
  status: MediaStatus;
  errorMessage: string | null;
  isPlaying: boolean;
}

const IMAGE_MIME_RE = /^image\//i;
const VIDEO_MIME_RE = /^video\//i;
const TIMEOUT_MS = 10000;

const EXTENSION_MEDIA_TYPE_MAP: Record<string, MediaKind> = {
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".avif": "image",
  ".svg": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".m4v": "video",
  ".ogv": "video",
};

export function deriveMediaKindFromContentType(contentType?: string | null): MediaKind {
  if (!contentType) {
    return "unknown";
  }

  const normalized = contentType.split(";")[0].trim().toLowerCase();

  if (IMAGE_MIME_RE.test(normalized)) {
    return "image";
  }

  if (VIDEO_MIME_RE.test(normalized)) {
    return "video";
  }

  return "unsupported";
}

export function deriveMediaKindFromPath(value: string): MediaKind {
  const candidate = (() => {
    try {
      return new URL(value).pathname;
    } catch {
      return value;
    }
  })();

  const extensionMatch = candidate.match(/(\.[a-z0-9]+)(?:\?|#|$)/i);
  if (!extensionMatch) {
    return "unknown";
  }

  return EXTENSION_MEDIA_TYPE_MAP[extensionMatch[1].toLowerCase()] ?? "unknown";
}

function createTimeoutSignal(signal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  const cleanup = () => {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", onAbort);
  };

  return {
    signal: controller.signal,
    cleanup,
  };
}

async function fetchContentType(url: string, signal: AbortSignal): Promise<string | undefined> {
  const fetchWithProbe = async (method: string, headers?: Record<string, string>) => {
    const { signal: timeoutSignal, cleanup } = createTimeoutSignal(signal, TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        signal: timeoutSignal,
        redirect: "follow",
        headers,
      });

      if (!response.ok) {
        return undefined;
      }

      return response.headers.get("content-type") ?? undefined;
    } finally {
      cleanup();
    }
  };

  const headType = await fetchWithProbe("HEAD");
  if (headType) {
    return headType;
  }

  return await fetchWithProbe("GET", { Range: "bytes=0-0" });
}

export async function detectIpfsMediaKind(url: string, signal: AbortSignal): Promise<MediaKind> {
  try {
    const contentType = await fetchContentType(url, signal);
    return deriveMediaKindFromContentType(contentType);
  } catch {
    return "unknown";
  }
}

function createInitialItem(cid: string): MediaItemState {
  return {
    cid,
    url: ipfsUrl(cid),
    kind: "unknown",
    status: "loading",
    errorMessage: null,
    isPlaying: false,
  };
}

export default function IPFSMediaGallery({ cids }: IPFSMediaGalleryProps) {
  const [items, setItems] = useState<MediaItemState[]>(() => cids.map(createInitialItem));
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setItems(cids.map(createInitialItem));

    const resolveItems = async () => {
      await Promise.all(
        cids.map(async (cid, index) => {
          const url = ipfsUrl(cid);
          try {
            const kind = await detectIpfsMediaKind(url, controller.signal);
            const resolvedKind = kind === "unknown" ? deriveMediaKindFromPath(cid) : kind;

            if (resolvedKind === "unsupported" || resolvedKind === "unknown") {
              throw new Error("Unsupported IPFS media type");
            }

            if (!mountedRef.current || requestIdRef.current !== requestId || controller.signal.aborted) {
              return;
            }

            setItems((previousItems) =>
              previousItems.map((item, itemIndex) =>
                itemIndex === index
                  ? {
                      ...item,
                      url,
                      kind: resolvedKind,
                      status: "ready",
                      errorMessage: null,
                    }
                  : item,
              ),
            );
          } catch (error) {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
              return;
            }

            const message =
              error instanceof Error && error.message
                ? error.message
                : "Failed to load media from IPFS. Please try again.";

            setItems((previousItems) =>
              previousItems.map((item, itemIndex) =>
                itemIndex === index
                  ? {
                      ...item,
                      kind: "unknown",
                      status: "error",
                      errorMessage: message,
                    }
                  : item,
              ),
            );
          }
        }),
      );
    };

    void resolveItems();
    return () => {
      controller.abort();
    };
  }, [cids]);

  const handleStartVideo = useCallback((index: number) => {
    setItems((previousItems) =>
      previousItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              isPlaying: true,
            }
          : item,
      ),
    );
  }, []);

  return (
    <section
      data-testid="ipfs-gallery"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-live="polite"
    >
      {items.map((item, index) => (
        <article
          key={`${item.cid}-${index}`}
          className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm transition hover:shadow-md"
          aria-busy={item.status === "loading"}
        >
          <div className="relative min-h-[220px] bg-slate-950/5 p-2 sm:min-h-[260px]">
            {item.status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-slate-950/5">
                <span
                  role="status"
                  className="inline-flex h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-600"
                  aria-label="Loading media"
                />
              </div>
            )}

            {item.status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
                <span className="text-2xl" aria-hidden="true">
                  ⚠️
                </span>
                <p className="font-semibold">Could not load IPFS media</p>
                <p>{item.errorMessage ?? "This content could not be resolved."}</p>
              </div>
            )}

            {item.status === "ready" && item.kind === "image" && (
              <div className="relative h-full w-full overflow-hidden rounded-3xl bg-slate-100">
                <Image
                  src={item.url}
                  alt={`IPFS image ${index + 1}`}
                  fill
                  unoptimized
                  sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                  loading="lazy"
                  className="object-cover"
                />
              </div>
            )}

            {item.status === "ready" && item.kind === "video" && (
              <div className="relative h-full w-full overflow-hidden rounded-3xl bg-slate-950 text-white">
                {item.isPlaying ? (
                  <video
                    className="h-full w-full object-cover"
                    controls
                    autoPlay
                    playsInline
                    muted
                    src={item.url}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartVideo(index)}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-slate-950/80 p-4 text-center transition hover:bg-slate-950/90"
                    aria-label={`Play IPFS video ${index + 1}`}
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-3xl font-semibold text-slate-950">
                      ▶
                    </span>
                    <span className="text-sm font-medium">Tap to play</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-slate-200/70 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="truncate font-medium">IPFS media {index + 1}</p>
            <p className="text-xs text-slate-500">{item.cid}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
