import { NextRequest, NextResponse } from 'next/server';
import { verifyMediaUrlSignature } from '@/lib/mediaUrlSigning';
import { createRequestLogger } from '@/lib/logger';
import { fetchMediaFromGateways } from '@/lib/mediaProxyGateway';
import { isValidCid, normalizeCid } from '@/lib/cid';
import { withRouteTelemetry } from '@/lib/telemetry';
import { IPFS_FALLBACK_GATEWAYS } from '@/lib/ipfsGateways';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { MediaModerationStore } from '@/lib/mediaModerationStore';

/**
 * GET /api/media/[cid]
 *
 * Proxies IPFS media through this app's own origin so that:
 *
 * 1. Repeat requests for the same CID are served from a CDN/edge cache in
 *    front of this route (Cache-Control below is what the platform's CDN —
 *    Vercel's Edge Network or any CDN configured in front of it — keys its
 *    cache on) instead of round-tripping to Pinata/IPFS every time.
 * 2. The raw gateway URL never appears in page HTML, so third parties can't
 *    trivially copy a Pinata/dweb.link link out of the DOM and hotlink it
 *    from another site.
 * 3. A signed, time-limited URL mechanism (lib/mediaUrlSigning.ts) is
 *    available for flows that need non-guessable, expiring links. When
 *    `MEDIA_URL_SIGNING_SECRET` isn't set (e.g. local dev), requests fall
 *    back to referrer-based gating instead of a hard block.
 *
 * CIDs are content-addressed — the same CID always resolves to the same
 * bytes — so an aggressive `immutable` Cache-Control is safe: a "changed"
 * profile photo/video is a *new* CID (see buildUpdateProfile in
 * lib/contract.ts), not a mutation of an existing one, which is what makes
 * cache invalidation a non-issue here.
 *
 * HTTP Range requests are forwarded upstream so <video> scrubbing works.
 * A bounded read-ahead probe (lib/mediaProxyGateway.ts) retries the next
 * gateway when an upstream stream stalls or errors before any bytes are
 * committed to the client.
 *
 * Adaptive HLS renditions (issue #1674): a rendition directory is pinned to
 * IPFS as its own CID. Playlists (`master.m3u8`, `*.m3u8`) and segments
 * (`*.ts`, `*.m4s`, `*.mp4`) are requested as
 * `/api/media/<renditionsCid>/<relative path>`. The relative path is
 * forwarded to the gateway as `<renditionsCid>/<path>`, so the same
 * moderation denylisting and URL signing apply to renditions as to the
 * original. Denylisting the original CID also blocks its renditions via the
 * `?original=<cid>` query param the player appends.
 */

const PRIMARY_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';

/** Same fallback order as lib/ipfs.ts's client-side gateway fallback. */
const FALLBACK_GATEWAYS = IPFS_FALLBACK_GATEWAYS;

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * HLS playlists are mutable-ish in the sense that a re-transcode produces a
 * new CID, so they can still be cached immutably. Segments are immutable.
 * We keep the same aggressive caching for both, but set the correct
 * Content-Type so Safari's native HLS player and hls.js accept them.
 */
const HLS_CONTENT_TYPES: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
};

/** Error responses must never be cached by the CDN or browser. */
function errorResponse(
  error: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
        ...headers,
      },
    },
  );
}

// Shared, Redis-backed (when configured) limiter from lib/rateLimit.ts so
// the limit holds across serverless instances (#1330).
const RATE_LIMIT_PER_WINDOW = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function isAllowedReferrer(req: NextRequest): boolean {
  const referer = req.headers.get('referer');
  // No Referer at all (direct navigation, privacy-focused browsers/extensions
  // that strip it) is allowed — we can't distinguish that from a legitimate
  // same-site request, so this check only catches an *explicit* cross-site
  // Referer, which is the common hotlinking/scraping signature.
  if (!referer) return true;

  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
  ].filter((v): v is string => Boolean(v));

  try {
    const refOrigin = new URL(referer).origin;
    return allowedOrigins.some((origin) => {
      try {
        return new URL(origin).origin === refOrigin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Split the catch-all `cid` param into the rendition directory CID and the
 * relative path inside it (e.g. `bafy.../480p/seg0.ts`). The first segment
 * must be a valid CID; the rest is a sanitized relative path with no `..`
 * traversal and no leading slash.
 */
function parseMediaPath(raw: string): { cid: string; subPath: string } | null {
  const slash = raw.indexOf('/');
  if (slash === -1) {
    return isValidCid(raw) ? { cid: normalizeCid(raw), subPath: '' } : null;
  }
  const cidPart = raw.slice(0, slash);
  const subPath = raw.slice(slash + 1);
  if (!isValidCid(cidPart)) return null;
  if (!subPath) return null;
  // Reject traversal and absolute paths; allow nested rendition dirs.
  if (subPath.startsWith('/') || subPath.split('/').some((s) => s === '..' || s === '.')) {
    return null;
  }
  return { cid: normalizeCid(cidPart), subPath };
}

function hlsContentType(subPath: string): string | undefined {
  const ext = subPath.slice(subPath.lastIndexOf('.') + 1).toLowerCase();
  return HLS_CONTENT_TYPES[ext];
}

async function getMedia(
  req: NextRequest,
  { params }: { params: { cid: string } },
) {
  const log = createRequestLogger(req);
  if (!params.cid) {
    return errorResponse('Missing cid', 400);
  }
  // Validate before any upstream fetch so callers can't shape arbitrary
  // gateway requests (path traversal, query injection) through our origin.
  const parsed = parseMediaPath(params.cid);
  if (!parsed) {
    return errorResponse('Invalid cid', 400);
  }
  // Canonical case, so `B…`/`b…` share one denylist entry and cache key.
  const { cid, subPath } = parsed;

  const { searchParams } = new URL(req.url);

  // Moderated media (issue #1320): never proxied, and never cached, so a
  // later reinstatement takes effect. This only covers ScoutOff's own
  // surfaces — the CID stays reachable through public IPFS gateways.
  //
  // Renditions (issue #1674): a rendition directory has its own CID, so the
  // player passes `?original=<originalCid>` so denylisting the original also
  // blocks its playlists and segments.
  const moderation = MediaModerationStore.getInstance();
  const originalParam = searchParams.get('original');
  const originalCid =
    originalParam && isValidCid(originalParam) ? normalizeCid(originalParam) : null;
  if (moderation.isDenylisted(cid) || (originalCid && moderation.isDenylisted(originalCid))) {
    return NextResponse.json(
      { error: 'This media has been removed for legal or policy reasons' },
      { status: 451, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(`media:${ip}`, {
    limit: RATE_LIMIT_PER_WINDOW,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rl.limited) {
    log.warn('Rate limit exceeded', { ip, cid });
    const retryAfter = rl.retryAfterSec ?? RATE_LIMIT_WINDOW_MS / 1000;
    return errorResponse('Too many requests', 429, {
      'Retry-After': String(retryAfter),
    });
  }

  const sig = searchParams.get('sig');
  const exp = searchParams.get('exp');

  if (sig || exp) {
    // A signature was presented — it must be valid and unexpired regardless
    // of Referer. Signatures are computed over the full media path (cid plus
    // rendition sub-path) so a signed original URL can't be reused to fetch
    // an unsigned rendition and vice versa.
    const signedPath = subPath ? `${cid}/${subPath}` : cid;
    if (!verifyMediaUrlSignature(signedPath, exp, sig)) {
      return errorResponse('Invalid or expired signature', 403);
    }
  } else if (!isAllowedReferrer(req)) {
    // No signature — fall back to referrer gating. This rejects the
    // explicit-cross-site-Referer case (another site directly embedding our
    // proxy URL) while still allowing same-site and no-Referer requests,
    // which covers ordinary in-app <img>/<video> usage today.
    return errorResponse('Forbidden', 403);
  }

  const gateways = [PRIMARY_GATEWAY, ...FALLBACK_GATEWAYS];
  const rangeHeader = req.headers.get('range');
  // Forward the rendition sub-path to the gateway as `<cid>/<path>` so the
  // existing gateway-racing/recovery logic (lib/mediaProxyGateway.ts) is
  // reused unchanged for playlists and segments.
  const upstreamCid = subPath ? `${cid}/${subPath}` : cid;

  try {
    const result = await fetchMediaFromGateways({
      cid: upstreamCid,
      gateways,
      rangeHeader,
    });

    if (!result) {
      log.error('All IPFS gateways exhausted', { cid, subPath });
      return errorResponse('Media not available', 502);
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': hlsContentType(subPath) ?? result.contentType,
      'Cache-Control': CACHE_CONTROL,
      // Vercel's Edge Network (and most CDNs) prefer a dedicated
      // CDN-facing directive over the browser-facing Cache-Control when
      // both are present, so edge caching still applies even if a
      // downstream proxy strips or rewrites Cache-Control for clients.
      'CDN-Cache-Control': CACHE_CONTROL,
      // Range + Accept so edge caches key full-file vs partial responses
      // separately without disabling caching for the common start-from-zero case.
      Vary: 'Range, Accept',
      'Accept-Ranges': result.acceptRanges,
    };

    if (result.contentRange) {
      responseHeaders['Content-Range'] = result.contentRange;
    }
    if (result.contentLength) {
      responseHeaders['Content-Length'] = result.contentLength;
    }

    return new NextResponse(result.body, {
      status: result.status,
      headers: responseHeaders,
    });
  } catch (err) {
    log.error('All IPFS gateways exhausted', {
      cid,
      subPath,
      reason: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('Media not available', 502);
  }
}

export const GET = withRouteTelemetry(getMedia, '/api/media/[cid]');
