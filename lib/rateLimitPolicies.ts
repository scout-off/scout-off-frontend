/**
 * Central rate-limit policy registry (#1474).
 *
 * Problem: Only a handful of routes call checkRateLimit directly and each
 * hand-rolls its own key format, limits, window length, and 429 response
 * body. Many state-changing or expensive routes have no throttling at all.
 *
 * This file is the single source of truth for every per-route rate-limit
 * policy. Routes import their named policy constant and pass it to the
 * shared `applyRateLimit` helper, which enforces a consistent 429 shape
 * (RFC 7807 problem+detail JSON, Retry-After header).
 *
 * Adding a new limit: add a `RateLimitPolicy` entry to `POLICIES` below,
 * then call `applyRateLimit(req, POLICIES.myRoute)` at the top of the
 * handler. No other changes needed.
 *
 * Key format convention: `<route-slug>:<ip>` — the slug keeps counters for
 * different routes isolated when they share a Redis namespace. When a
 * policy sets `identity` to include the wallet, the key becomes
 * `<route-slug>:<ip>:<wallet>` (or `<route-slug>:<wallet>` for wallet-only).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  type RateLimitOptions,
} from './rateLimit';
import { getSessionWallet } from './auth/session';

// ── Policy definition ─────────────────────────────────────────────────────────

/**
 * Which dimension(s) a policy is keyed on. Authenticated routes should use
 * `'wallet'` or `'ip+wallet'` so a single wallet cannot rotate IPs to evade
 * limits, and NAT-ed users (common on mobile carriers) do not share a single
 * IP bucket.
 */
export type RateLimitIdentity = 'ip' | 'wallet' | 'ip+wallet';

export interface RateLimitPolicy extends RateLimitOptions {
  /** Used as the first segment of the Redis/in-memory key: `<slug>:<ip>`. */
  slug: string;
  /**
   * Human-readable message returned in the 429 body. Should describe what
   * the caller was trying to do, not the technical limit.
   */
  message: string;
  /**
   * Keying dimension. Defaults to `'ip'` when omitted. Authenticated routes
   * should set `'wallet'` or `'ip+wallet'`.
   */
  identity?: RateLimitIdentity;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Every API route that needs per-IP rate limiting must have an entry here.
 * Limits are intentionally conservative defaults — tune via env overrides or
 * follow-up PRs once real traffic data is available.
 */
export const POLICIES = {
  // ── Auth ────────────────────────────────────────────────────────────────────

  /** SEP-10 challenge + verify are the login critical path — low abuse risk,
   *  but a brute-force against challenge/verify is the entry point for
   *  wallet enumeration, so we still limit it. */
  authSep10: {
    slug: 'auth-sep10',
    onStoreError: 'local',
    limit: 20,
    windowMs: 60_000,
    message: 'Too many authentication requests. Please try again shortly.',
  },

  /** Token refresh rotates credentials — only one inflight per client is
   *  legitimate; a burst signals a loop or abuse. */
  authRefresh: {
    slug: 'auth-refresh',
    onStoreError: 'local',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many session refresh requests.',
    identity: 'ip+wallet',
  },

  /** Logout-all terminates every active session — should be rare. */
  authLogoutAll: {
    slug: 'auth-logout-all',
    onStoreError: 'local',
    limit: 5,
    windowMs: 60_000,
    message: 'Too many logout requests. Please wait before trying again.',
    identity: 'ip+wallet',
  },

  /** Session listing / revocation endpoints. */
  authSessions: {
    slug: 'auth-sessions',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many session requests. Please slow down.',
    identity: 'ip+wallet',
  },

  // ── Players / Search ────────────────────────────────────────────────────────

  /** Typeahead search fires per-keystroke client-side. The 300 ms debounce
   *  is a UX hint, not a security boundary; this is the real limit. */
  playersSearch: {
    slug: 'players-search',
    limit: 20,
    windowMs: 10_000,
    message: 'Too many search requests. Please slow down.',
  },

  // ── CV ──────────────────────────────────────────────────────────────────────

  /** CV signing involves multiple async Soroban lookups per request. */
  cvSign: {
    slug: 'cv-sign',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many CV export requests. Please try again shortly.',
  },

  // ── IPFS uploads ────────────────────────────────────────────────────────────

  /** Upload initiation — limit storage abuse. */
  ipfsUploadInit: {
    slug: 'ipfs-upload-init',
    limit: 20,
    windowMs: 60_000,
    message: 'Too many upload requests. Please try again shortly.',
  },

  /** Chunk upload — inherits same limits, keyed separately. */
  ipfsUploadChunk: {
    slug: 'ipfs-upload-chunk',
    limit: 200,
    windowMs: 60_000,
    message: 'Upload rate limit exceeded. Please slow down.',
  },

  /** Legacy single-request upload endpoint. */
  ipfsUpload: {
    slug: 'ipfs-upload',
    limit: 20,
    windowMs: 60_000,
    message: 'Too many upload requests. Please try again shortly.',
  },

  /** Superseded-IPFS listing — read-heavy, cheap to abuse. */
  ipfsSuperseded: {
    slug: 'ipfs-superseded',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many superseded-IPFS requests. Please slow down.',
  },

  // ── Media ───────────────────────────────────────────────────────────────────

  /** Media abuse reports — prevent report spam. */
  mediaReport: {
    slug: 'media-report',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many media reports. Please wait before reporting again.',
  },

  /** Media denylist mutations — admin-adjacent, keep tight. */
  mediaDenylist: {
    slug: 'media-denylist',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many denylist requests. Please slow down.',
    identity: 'ip+wallet',
  },

  // ── CSP reports ─────────────────────────────────────────────────────────────

  /** CSP violation reports are browser-generated but can be spoofed at volume. */
  cspReport: {
    slug: 'csp-report',
    limit: 30,
    windowMs: 60_000,
    message: 'CSP report rate limit exceeded.',
  },

  // ── Contact vault ────────────────────────────────────────────────────────────

  /** Contact details release — involves on-chain verification per call. */
  contactRelease: {
    slug: 'contact-release',
    onStoreError: 'local',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many contact requests. Please try again shortly.',
    identity: 'ip+wallet',
  },

  /** Contact vault upload (encrypted contact details). */
  contactVaultUpload: {
    slug: 'contact-vault',
    onStoreError: 'local',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many vault upload requests. Please try again shortly.',
    identity: 'ip+wallet',
  },

  // ── Disputes ─────────────────────────────────────────────────────────────────

  /** Creating a dispute touches the DB and may trigger notifications. */
  disputeCreate: {
    slug: 'dispute-create',
    limit: 5,
    windowMs: 60_000,
    message:
      'Too many dispute submissions. Please wait before submitting again.',
    identity: 'ip+wallet',
  },

  /** Adding evidence to an existing dispute. */
  disputeEvidence: {
    slug: 'dispute-evidence',
    limit: 20,
    windowMs: 60_000,
    message: 'Too many evidence uploads. Please slow down.',
    identity: 'ip+wallet',
  },

  /** Deciding a dispute — admin action, keep tight. */
  disputeDecide: {
    slug: 'dispute-decide',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many dispute decisions. Please slow down.',
    identity: 'ip+wallet',
  },

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Preference updates are low-frequency; a burst signals a bug or abuse. */
  notificationPreferences: {
    slug: 'notification-prefs',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many preference updates. Please slow down.',
    identity: 'ip+wallet',
  },

  // ── Migration ────────────────────────────────────────────────────────────────

  /** Migration request kicks off an async pipeline — expensive per call. */
  migrationRequest: {
    slug: 'migration-request',
    limit: 3,
    windowMs: 60_000,
    message: 'Too many migration requests. Please wait before retrying.',
  },

  // ── Data export / deletion ───────────────────────────────────────────────────

  /** Data export can generate large archives. */
  dataExport: {
    slug: 'data-export',
    limit: 3,
    windowMs: 60_000,
    message: 'Too many export requests. Please wait before requesting again.',
    identity: 'ip+wallet',
  },

  /** Data deletion requests. */
  dataDeletion: {
    slug: 'data-deletion',
    limit: 3,
    windowMs: 60_000,
    message: 'Too many deletion requests. Please wait before retrying.',
    identity: 'ip+wallet',
  },

  // ── Watchlist / saved searches / recently viewed ──────────────────────────

  watchlist: {
    slug: 'watchlist',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many watchlist requests. Please slow down.',
    identity: 'ip+wallet',
  },

  savedSearches: {
    slug: 'saved-searches',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many saved-search requests. Please slow down.',
    identity: 'ip+wallet',
  },

  recentlyViewed: {
    slug: 'recently-viewed',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many recently-viewed requests. Please slow down.',
    identity: 'ip+wallet',
  },

  // ── Milestones ──────────────────────────────────────────────────────────────

  /** Endorsements are signed and persisted — limit spam. */
  milestoneEndorsement: {
    slug: 'milestone-endorsement',
    limit: 20,
    windowMs: 60_000,
    message: 'Too many endorsement requests. Please slow down.',
    identity: 'ip+wallet',
  },

  // ── Indexer ─────────────────────────────────────────────────────────────────

  /** Indexer stream is long-lived but reconnects can be abused. */
  indexerStream: {
    slug: 'indexer-stream',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many indexer stream requests. Please slow down.',
  },

  // ── Upload tracking ──────────────────────────────────────────────────────────

  uploadTracking: {
    slug: 'upload-tracking',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many upload tracking requests. Please slow down.',
  },

  // ── Admin ────────────────────────────────────────────────────────────────────

  /**
   * Admin API default. Moved here from middleware.ts (#1665) so all limits
   * live in one registry. Bucket protection from #1494 is preserved by
   * `normaliseAdminPath` in middleware, which collapses dynamic segments
   * before the key is built.
   */
  adminDefault: {
    slug: 'admin-default',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many admin requests. Please slow down.',
    identity: 'ip+wallet',
  },

  /** Reconcile and fraud-evaluation are expensive — 3/min. */
  adminReconcile: {
    slug: 'admin-reconcile',
    limit: 3,
    windowMs: 60_000,
    message: 'Too many reconcile requests. Please wait before retrying.',
    identity: 'ip+wallet',
  },

  adminFraudEvaluation: {
    slug: 'admin-fraud-evaluation',
    limit: 3,
    windowMs: 60_000,
    message: 'Too many fraud-evaluation requests. Please wait before retrying.',
    identity: 'ip+wallet',
  },
} as const satisfies Record<string, RateLimitPolicy>;

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Build the rate-limit key for a policy + request, honouring the policy's
 * `identity` dimension. Wallet is resolved via `getSessionWallet(req)`; when
 * a wallet-keyed policy is applied to an unauthenticated request we fall back
 * to IP-only so the request is still throttled.
 */
function buildKey(req: NextRequest, policy: RateLimitPolicy): string {
  const ip = getClientIp(req);
  const identity = policy.identity ?? 'ip';

  if (identity === 'ip') {
    return `${policy.slug}:${ip}`;
  }

  const wallet = getSessionWallet(req);
  if (!wallet) {
    // Unauthenticated caller on a wallet-keyed route: fall back to IP so the
    // request is still throttled rather than bypassing the limit entirely.
    return `${policy.slug}:${ip}`;
  }

  return identity === 'wallet'
    ? `${policy.slug}:${wallet}`
    : `${policy.slug}:${ip}:${wallet}`;
}

/**
 * Apply a rate-limit policy to an incoming request.
 *
 * Returns a `NextResponse` (HTTP 429) when the caller has exceeded the
 * policy, or `null` when the request may proceed. The 429 body is RFC 7807
 * `application/problem+json` with `type`/`title`/`status`/`detail`, and the
 * response carries a `Retry-After` header.
 */
export async function applyRateLimit(
  req: NextRequest,
  policy: RateLimitPolicy,
): Promise<NextResponse | null> {
  const key = buildKey(req, policy);
  const result = await checkRateLimit(key, {
    limit: policy.limit,
    windowMs: policy.windowMs,
    onStoreError: policy.onStoreError,
  });

  if (result.allowed) {
    return null;
  }

  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  );

  return new NextResponse(
    JSON.stringify({
      type: 'https://handsoff.app/problems/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: policy.message,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/problem+json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}
