/**
 * Rate-limit policy table (#1474), kept free of server-only imports so the
 * Edge middleware can read the admin policies without pulling in the
 * session store (which uses Node's fs). Routes should keep importing from
 * `@/lib/rateLimitPolicies`, which re-exports everything here alongside
 * `applyRateLimit`.
 */
import type { RateLimitOptions } from './rateLimit';

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
