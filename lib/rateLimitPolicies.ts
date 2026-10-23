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
 * different routes isolated when they share a Redis namespace.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, type RateLimitOptions } from './rateLimit';

// ── Policy definition ─────────────────────────────────────────────────────────

export interface RateLimitPolicy extends RateLimitOptions {
  /** Used as the first segment of the Redis/in-memory key: `<slug>:<ip>`. */
  slug: string;
  /**
   * Human-readable message returned in the 429 body. Should describe what
   * the caller was trying to do, not the technical limit.
   */
  message: string;
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
    limit: 20,
    windowMs: 60_000,
    message: 'Too many authentication requests. Please try again shortly.',
  },

  /** Token refresh rotates credentials — only one inflight per client is
   *  legitimate; a burst signals a loop or abuse. */
  authRefresh: {
    slug: 'auth-refresh',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many session refresh requests.',
  },

  /** Logout-all terminates every active session — should be rare. */
  authLogoutAll: {
    slug: 'auth-logout-all',
    limit: 5,
    windowMs: 60_000,
    message: 'Too many logout requests. Please wait before trying again.',
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

  // ── Media ───────────────────────────────────────────────────────────────────

  /** Media abuse reports — prevent report spam. */
  mediaReport: {
    slug: 'media-report',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many media reports. Please wait before reporting again.',
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
    limit: 30,
    windowMs: 60_000,
    message: 'Too many contact requests. Please try again shortly.',
  },

  /** Contact vault upload (encrypted contact details). */
  contactVaultUpload: {
    slug: 'contact-vault',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many vault upload requests. Please try again shortly.',
  },

  // ── Disputes ─────────────────────────────────────────────────────────────────

  /** Creating a dispute touches the DB and may trigger notifications. */
  disputeCreate: {
    slug: 'dispute-create',
    limit: 5,
    windowMs: 60_000,
    message: 'Too many dispute submissions. Please wait before submitting again.',
  },

  /** Adding evidence to an existing dispute. */
  disputeEvidence: {
    slug: 'dispute-evidence',
    limit: 20,
    windowMs: 60_000,
    message: 'Too many evidence uploads. Please slow down.',
  },

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Preference updates are low-frequency; a burst signals a bug or abuse. */
  notificationPreferences: {
    slug: 'notification-prefs',
    limit: 10,
    windowMs: 60_000,
    message: 'Too many preference updates. Please slow down.',
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
  },

  /** Data deletion requests. */
  dataDeletion: {
    slug: 'data-deletion',
    limit: 3,
    windowMs: 60_000,
    message: 'Too many deletion requests. Please wait before retrying.',
  },

  // ── Watchlist / saved searches / recently viewed ──────────────────────────

  watchlist: {
    slug: 'watchlist',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many watchlist requests. Please slow down.',
  },

  savedSearches: {
    slug: 'saved-searches',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many saved-search requests. Please slow down.',
  },

  recentlyViewed: {
    slug: 'recently-viewed',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many recently-viewed requests. Please slow down.',
  },

  // ── Upload tracking ──────────────────────────────────────────────────────────

  uploadTracking: {
    slug: 'upload-tracking',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many upload tracking requests. Please slow down.',
  },
} as const satisfies Record<string, RateLimitPolicy>;

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Apply a rate-limit policy to an incoming request.
 *
 * Returns a `NextResponse` (HTTP 429) when the caller has exceeded the
 * policy limit, or `null` when the request is within budget.
 *
 * Usage:
 * ```ts
 * const limited = await applyRateLimit(req, POLICIES.myRoute);
 * if (limited) return limited;
 * ```
 *
 * The 429 response body follows RFC 7807 (application/problem+json):
 * ```json
 * { "error": "Too many ...", "retryAfterSec": 42 }
 * ```
 * A `Retry-After` header (seconds) is always included so clients and
 * intermediaries can back off automatically.
 */
export async function applyRateLimit(
  req: NextRequest,
  policy: RateLimitPolicy,
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const result = await checkRateLimit(`${policy.slug}:${ip}`, {
    limit: policy.limit,
    windowMs: policy.windowMs,
  });

  if (!result.limited) return null;

  const retryAfter = result.retryAfterSec ?? Math.ceil(policy.windowMs / 1000);
  return NextResponse.json(
    { error: policy.message, retryAfterSec: retryAfter },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    },
  );
}
