/**
 * Client-safe helper for building the app's own IPFS media proxy path.
 *
 * Components should use this instead of pointing directly at
 * `NEXT_PUBLIC_IPFS_GATEWAY` so media requests flow through `/api/media/[cid]`
 * (see app/api/media/[cid]/route.ts). That gives repeat viewers a CDN-cached
 * response from this app's own edge instead of round-tripping to Pinata every
 * time, and keeps the raw gateway URL out of page HTML so it can't be
 * trivially hotlinked from other sites.
 *
 * This file must stay free of Node-only imports (no `crypto`, no server
 * secrets) since it's imported from client components. Signed-URL generation
 * lives in lib/mediaUrlSigning.ts, which is server-only.
 */
export interface MediaProxyUrlOptions {
  /** Client retry counter — cache-busts the proxy URL on playback recovery. */
  retry?: number;
}

export function getMediaProxyUrl(
  cid: string,
  options?: MediaProxyUrlOptions,
): string {
  const base = `/api/media/${encodeURIComponent(cid)}`;
  const retry = options?.retry;
  if (retry !== undefined && retry > 0) {
    return `${base}?retry=${retry}`;
  }
  return base;
}
