import { NextRequest } from 'next/server';
import { initSession } from '@/lib/chunkedUploadStore';
import { getSessionWallet } from '@/lib/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { privateJson } from '@/lib/httpResponses';
import { createRequestLogger } from '@/lib/logger';
import { apiError, ApiErrorCode } from '@/lib/apiErrors';
import {
  getPinataCredentials,
  getMissingPinataEnvVars,
  PINATA_NOT_CONFIGURED_ERROR,
} from '@/lib/pinataConfig';

export const runtime = 'nodejs';

/**
 * POST /api/ipfs/upload/init
 *
 * Starts a chunked/resumable upload session. Body: JSON
 * `{ filename, fileType, fileSize, totalChunks }`. Returns `{ sessionId }`.
 *
 * Validates size/type up front (mirroring app/api/ipfs/upload's checks) so
 * an obviously-invalid upload is rejected before the client spends any
 * bandwidth on chunks. The magic-byte check is deferred to /complete, since
 * only the first chunk carries the file's leading bytes.
 */
const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'video/'];
/** Chunks smaller than this would multiply request count for no benefit. */
const MIN_CHUNK_SIZE_BYTES = 64 * 1024;
const MAX_CHUNKS = 5000;

export async function POST(req: NextRequest) {
  const log = createRequestLogger(req);
  if (!getPinataCredentials()) {
    log.error('Pinata credentials missing; IPFS uploads disabled', {
      missing: getMissingPinataEnvVars().join(', '),
    });
    return privateJson({ error: PINATA_NOT_CONFIGURED_ERROR }, { status: 503 });
  }
  const wallet = getSessionWallet(req);
  const ip = getClientIp(req);
  const key = wallet ? `wallet:${wallet}` : ip;
  const rl = await checkRateLimit(`ipfs-upload-init:${key}`, RATE_LIMIT);
  if (rl.limited) {
    const retryAfter = rl.retryAfterSec ?? 60;
    return apiError(
      ApiErrorCode.RATE_LIMITED,
      429,
      'Too many requests',
      undefined,
      { headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(ApiErrorCode.INVALID_JSON, 400, 'Invalid JSON body');
  }

  const { filename, fileType, fileSize, totalChunks } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof filename !== 'string' || !filename.trim()) {
    return apiError(ApiErrorCode.MISSING_FIELDS, 400, 'filename is required', { field: 'filename' });
  }

  if (
    typeof fileType !== 'string' ||
    !ALLOWED_MIME_PREFIXES.some((prefix) =>
      fileType.toLowerCase().startsWith(prefix),
    )
  ) {
    return apiError(
      ApiErrorCode.UPLOAD_TYPE_NOT_ALLOWED,
      400,
      `File type "${fileType}" is not allowed. Only image/* and video/* files are accepted.`,
      { type: String(fileType ?? '') },
    );
  }

  if (
    typeof fileSize !== 'number' ||
    !Number.isFinite(fileSize) ||
    fileSize <= 0
  ) {
    return apiError(ApiErrorCode.INVALID_FIELD_VALUE, 400, 'fileSize must be a positive number', { field: 'fileSize' });
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return apiError(
      ApiErrorCode.INVALID_REQUEST,
      400,
      `File exceeds the 100 MB size limit (received ${(fileSize / 1024 / 1024).toFixed(1)} MB)`,
    );
  }

  if (
    typeof totalChunks !== 'number' ||
    !Number.isInteger(totalChunks) ||
    totalChunks <= 0
  ) {
    return apiError(ApiErrorCode.INVALID_FIELD_VALUE, 400, 'totalChunks must be a positive integer', { field: 'totalChunks' });
  }

  if (totalChunks > MAX_CHUNKS) {
    return apiError(ApiErrorCode.INVALID_REQUEST, 400, 'totalChunks is unreasonably high');
  }

  if (totalChunks > 1 && fileSize / totalChunks < MIN_CHUNK_SIZE_BYTES) {
    return apiError(ApiErrorCode.INVALID_REQUEST, 400, 'Chunk count too high for the given file size');
  }

  const { sessionId } = await initSession({
    filename,
    fileType,
    fileSize,
    totalChunks,
    ownerWallet: wallet,
  });
  return privateJson({ sessionId }, { status: 201 });
}
