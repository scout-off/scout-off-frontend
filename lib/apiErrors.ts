import { NextResponse } from 'next/server';

/**
 * Stable, machine-readable API error codes (issue #1323). Routes return
 * `{ error: { code, params?, message } }` via `apiError()`; the client maps
 * `code` to a translated string under the `apiErrors` namespace in
 * messages/*.json (see hooks/useApiErrorMessage.ts). `message` is English,
 * kept for logs and backward compatibility while routes are migrated.
 *
 * Never put a caught exception's `.message` in `message` — log it with the
 * request id instead.
 */
export const ApiErrorCode = {
  // ── Auth / access ──────────────────────────────────────────────────────────
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // ── Request validation ────────────────────────────────────────────────────
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_JSON: 'INVALID_JSON',
  MISSING_FIELDS: 'MISSING_FIELDS',
  QUERY_TOO_LONG: 'QUERY_TOO_LONG',
  FIELD_TOO_LONG: 'FIELD_TOO_LONG',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',

  // ── Resource not found ────────────────────────────────────────────────────
  NOT_FOUND: 'NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  MILESTONE_NOT_FOUND: 'MILESTONE_NOT_FOUND',
  DISPUTE_NOT_FOUND: 'DISPUTE_NOT_FOUND',
  ACADEMY_NOT_FOUND: 'ACADEMY_NOT_FOUND',
  UPLOAD_SESSION_NOT_FOUND: 'UPLOAD_SESSION_NOT_FOUND',
  THROTTLE_NOT_FOUND: 'THROTTLE_NOT_FOUND',

  // ── Conflict / business rules ─────────────────────────────────────────────
  DISPUTE_ALREADY_PENDING: 'DISPUTE_ALREADY_PENDING',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // ── Upload ────────────────────────────────────────────────────────────────
  CHUNK_INDEX_OUT_OF_RANGE: 'CHUNK_INDEX_OUT_OF_RANGE',
  UPLOAD_INCOMPLETE: 'UPLOAD_INCOMPLETE',
  UPLOAD_SIZE_MISMATCH: 'UPLOAD_SIZE_MISMATCH',
  UPLOAD_TYPE_NOT_ALLOWED: 'UPLOAD_TYPE_NOT_ALLOWED',
  UPLOAD_CONTENT_MISMATCH: 'UPLOAD_CONTENT_MISMATCH',

  // ── External / upstream ───────────────────────────────────────────────────
  UPSTREAM_FAILED: 'UPSTREAM_FAILED',
  IPFS_UPLOAD_FAILED: 'IPFS_UPLOAD_FAILED',
  IPFS_NOT_CONFIGURED: 'IPFS_NOT_CONFIGURED',
  UPLOAD_VERIFICATION_FAILED: 'UPLOAD_VERIFICATION_FAILED',

  // ── Server ────────────────────────────────────────────────────────────────
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiErrorParams = Record<string, string | number>;

export interface ApiErrorBody {
  error: { code: ApiErrorCode; params?: ApiErrorParams; message: string };
}

export function apiError(
  code: ApiErrorCode,
  status: number,
  message: string,
  params?: ApiErrorParams,
  init?: ResponseInit,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, ...(params ? { params } : {}), message } },
    { ...init, status },
  );
}

/**
 * Extracts `{ code, params }` from a parsed error response body, or null for
 * a body that doesn't use the coded shape (e.g. a not-yet-migrated route's
 * `{ error: string }`).
 */
export function parseApiError(
  body: unknown,
): { code: string; params?: ApiErrorParams } | null {
  const error = (body as { error?: unknown } | null)?.error;
  if (error && typeof error === 'object' && 'code' in error) {
    const { code, params } = error as { code: unknown; params?: unknown };
    if (typeof code === 'string') {
      return { code, params: params as ApiErrorParams | undefined };
    }
  }
  return null;
}
