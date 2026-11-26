import axios from 'axios';
import { IPFS_FALLBACK_GATEWAYS } from './ipfsGateways';

const PRIMARY_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';

/**
 * Default ordered list of fallback IPFS gateways used when the primary gateway
 * returns a 4xx or 5xx response or times out.
 *
 * Exported so consumers and test suites can reference or override the list.
 */
export const DEFAULT_IPFS_FALLBACKS: string[] = [...IPFS_FALLBACK_GATEWAYS];

/**
 * Per-gateway race timeout. Each concurrent probe is aborted after this many
 * milliseconds if it hasn't responded yet.
 *
 * 3 s is intentionally tighter than the sequential ATTEMPT_TIMEOUT_MS: in a
 * concurrent race we can afford to cut slow gateways loose early because a
 * working peer can win before this timeout fires. The constraint from the
 * issue is first playable frame within 3 s on a healthy primary gateway, so
 * the race probe must complete well within that budget.
 */
export const RACE_TIMEOUT_MS = 3_000;

export interface RacedGatewayResult {
  /** Fully-qualified URL for the CID on the winning gateway. */
  url: string;
  /** The winning gateway base URL. */
  gateway: string;
  /** Round-trip time in milliseconds from race start to first successful HEAD response. */
  latencyMs: number;
  /** True when the primary gateway won the race; false when a fallback gateway won. */
  isPrimary: boolean;
}

/**
 * Race all gateways concurrently for a CID and return the first to respond
 * with a successful HEAD request.
 *
 * Unlike the sequential {@link ipfsUrl}, this fires all probes at once and
 * cancels the losers as soon as the first winner responds. The latency budget
 * is therefore bounded by the *fastest* available gateway rather than the
 * sum of all failures.
 *
 * @param cid       - The IPFS content identifier to resolve.
 * @param fallbacks - Optional ordered list of fallback gateway base URLs.
 *                    Defaults to {@link DEFAULT_IPFS_FALLBACKS}.
 * @param timeoutMs - Per-gateway HEAD-probe timeout in ms. Defaults to
 *                    {@link RACE_TIMEOUT_MS}.
 * @returns The URL and metadata for the fastest-responding gateway.
 * @throws When no gateway responds successfully within the timeout.
 */
export async function raceGateways(
  cid: string,
  fallbacks: string[] = DEFAULT_IPFS_FALLBACKS,
  timeoutMs: number = RACE_TIMEOUT_MS,
): Promise<RacedGatewayResult> {
  const gateways = [PRIMARY_GATEWAY, ...fallbacks];
  const raceStart = performance.now();

  // One AbortController per probe so we can cancel all losers once a winner
  // is found. We deliberately do not share one controller: cancelling a
  // shared signal would race with the winner's own teardown path.
  const controllers = gateways.map(() => new AbortController());

  const probes = gateways.map((gateway, idx): Promise<RacedGatewayResult> => {
    const url = `${gateway}/${cid}`;
    const controller = controllers[idx];

    return new Promise<RacedGatewayResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gateway ${gateway} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fetch(url, { method: 'HEAD', signal: controller.signal })
        .then((res) => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            reject(
              new Error(`Gateway ${gateway} returned HTTP ${res.status}`),
            );
            return;
          }
          resolve({
            url,
            gateway,
            latencyMs: Math.round(performance.now() - raceStart),
            isPrimary: idx === 0,
          });
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
    });
  });

  try {
    // Promise.any resolves with the first fulfilled probe and ignores all
    // rejections unless every probe rejects (AggregateError path below).
    const winner = await Promise.any(probes);

    // Cancel all losing probes to free their connections.
    controllers.forEach((ctrl, idx) => {
      if (gateways[idx] !== winner.gateway) {
        ctrl.abort();
      }
    });

    if (!winner.isPrimary) {
      console.warn(
        `[ipfs] Fallback gateway won race (${winner.latencyMs}ms): ${winner.gateway}`,
      );
    }

    return winner;
  } catch (err) {
    // AggregateError: every probe failed.
    throw new Error(
      `[ipfs] All gateways failed race for CID "${cid}". Tried: ${gateways.join(', ')}`,
    );
  }
}

/**
 * Upload a file to IPFS via the internal API route in a single request.
 * Prefer {@link uploadToIPFSChunked} for large files (e.g. highlight-reel
 * videos) on unreliable connections — a dropped connection here means
 * starting over from byte zero.
 *
 * @param file - The file to upload.
 * @returns The IPFS CID string assigned by the pinning service.
 */
export async function uploadToIPFS(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await axios.post('/api/ipfs/upload', form);
  return data.cid as string;
}

// ── Chunked / resumable upload ──────────────────────────────────────────────
//
// Splits a file into fixed-size chunks and uploads them one at a time
// against app/api/ipfs/upload/{init,chunk,complete} — tuned for the
// low-bandwidth, high-latency mobile connections this product targets
// (issue #664). Each chunk is retried independently with exponential
// backoff before the whole upload gives up, and a failure after exhausting
// retries throws a {@link ChunkedUploadError} carrying enough state
// (`sessionId`, `uploadedChunks`) for a caller to resume from the last
// successfully received chunk rather than restarting the whole file.

/** 1 MB — small enough to complete (or fail) quickly on a weak connection. */
export const CHUNK_SIZE_BYTES = 1 * 1024 * 1024;

/** Per-chunk retry attempts before the upload surfaces as resumable-but-failed. */
const MAX_CHUNK_RETRIES = 4;

/** Base delay for exponential backoff between chunk retries. */
const RETRY_BASE_DELAY_MS = 500;

/**
 * Thrown when a chunk fails after exhausting retries. Carries the session
 * state needed to resume: pass `sessionId` back into
 * {@link uploadToIPFSChunked}'s `resumeSessionId` option to continue from
 * the next unsent chunk instead of re-uploading the whole file.
 */
export class ChunkedUploadError extends Error {
  sessionId: string;
  uploadedChunks: number;
  totalChunks: number;
  retryAfterSec?: number;

  constructor(
    message: string,
    sessionId: string,
    uploadedChunks: number,
    totalChunks: number,
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ChunkedUploadError';
    this.sessionId = sessionId;
    this.uploadedChunks = uploadedChunks;
    this.totalChunks = totalChunks;
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * `uploading` covers the byte-transfer of chunks to our server, which has
 * real, granular progress. `processing` covers the server assembling the
 * chunks and pinning the result to IPFS/Pinata via `/complete` — a single
 * request with no sub-progress, so it's surfaced as a distinct phase rather
 * than a progress percentage that would otherwise appear stuck at 100%.
 */
export type ChunkedUploadPhase = 'uploading' | 'processing';

export interface ChunkedUploadOptions {
  /** Called after each chunk is confirmed uploaded, with overall progress in [0, 1]. */
  onProgress?: (fraction: number) => void;
  /** Called when the upload transitions between phases. */
  onPhaseChange?: (phase: ChunkedUploadPhase) => void;
  /**
   * Resume a previously started (and since-failed) session instead of
   * calling /init again — skips straight to uploading whatever chunks the
   * server doesn't already have.
   */
  resumeSessionId?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadChunkWithRetry(
  sessionId: string,
  chunkIndex: number,
  blob: Blob,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      const form = new FormData();
      form.set('sessionId', sessionId);
      form.set('chunkIndex', String(chunkIndex));
      form.set('chunk', blob);
      await axios.post('/api/ipfs/upload/chunk', form);
      return;
    } catch (err) {
      lastErr = err;
      // If this is a 429 response, extract retryAfterSec and throw immediately
      // rather than retrying (retries won't help against a rate limit)
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const retryAfter = (err.response?.headers as any)?.['retry-after'];
        const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : undefined;
        throw new ChunkedUploadError(
          'Upload rate limited. Please wait and try again.',
          sessionId,
          chunkIndex,
          0, // totalChunks not known at this point
          retryAfterSec,
        );
      }
      // Other 4xx responses (bad chunk index, unknown/expired session) won't
      // succeed on retry — surface them immediately.
      if (
        axios.isAxiosError(err) &&
        err.response &&
        err.response.status >= 400 &&
        err.response.status < 500
      ) {
        throw err;
      }
    }
  }
  throw lastErr;
}

/**
 * Fetches which chunk indices a session has already received — used both
 * internally (resuming from a `resumeSessionId`) and by callers that want
 * to inspect progress independently.
 */
export async function getChunkedUploadStatus(
  sessionId: string,
): Promise<{ receivedChunks: number[]; totalChunks: number }> {
  const { data } = await axios.get('/api/ipfs/upload/status', {
    params: { sessionId },
  });
  return data;
}

/**
 * Uploads a file in fixed-size chunks that can resume after a mid-transfer
 * failure instead of restarting from byte zero.
 *
 * @param file - The file to upload.
 * @param options - Progress callback and/or a session id to resume.
 * @returns The IPFS CID string assigned by the pinning service.
 * @throws {ChunkedUploadError} When a chunk fails after exhausting retries —
 *   catch this and pass `err.sessionId` as `resumeSessionId` on retry.
 */
export async function uploadToIPFSChunked(
  file: File,
  options: ChunkedUploadOptions = {},
): Promise<string> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

  options.onPhaseChange?.('uploading');

  let sessionId = options.resumeSessionId;
  let startChunk = 0;

  if (sessionId) {
    const status = await getChunkedUploadStatus(sessionId);
    startChunk = status.receivedChunks.length;
  } else {
    try {
      const { data } = await axios.post('/api/ipfs/upload/init', {
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        totalChunks,
      });
      sessionId = data.sessionId as string;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const retryAfter = (err.response?.headers as any)?.['retry-after'];
        const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : undefined;
        throw new ChunkedUploadError(
          'Upload rate limited. Please wait and try again.',
          '',
          0,
          totalChunks,
          retryAfterSec,
        );
      }
      throw err;
    }
  }

  options.onProgress?.(startChunk / totalChunks);

  for (let i = startChunk; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
    const chunkBlob = file.slice(start, end);

    try {
      await uploadChunkWithRetry(sessionId, i, chunkBlob);
    } catch {
      throw new ChunkedUploadError(
        'Upload interrupted. You can resume from where it left off.',
        sessionId,
        i,
        totalChunks,
      );
    }
    options.onProgress?.((i + 1) / totalChunks);
  }

  options.onPhaseChange?.('processing');
  try {
    const { data } = await axios.post('/api/ipfs/upload/complete', {
      sessionId,
    });
    return data.cid as string;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      const retryAfter = (err.response?.headers as any)?.['retry-after'];
      const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : undefined;
      throw new ChunkedUploadError(
        'Upload rate limited. Please wait and try again.',
        sessionId,
        totalChunks,
        totalChunks,
        retryAfterSec,
      );
    }
    throw err;
  }
}

/**
 * Resolve a full URL for an IPFS CID using concurrent gateway racing.
 *
 * All gateways are probed simultaneously with HEAD requests. The first to
 * return a successful response wins; the rest are cancelled. This replaces
 * the former sequential loop (which tried one gateway at a time, waiting up
 * to 8 s per failure before moving on) and is now the backing implementation
 * used by both this function and the hooks that drive {@link IPFSMediaGallery}.
 *
 * A console warning is emitted when the winning gateway is not the primary.
 *
 * @param cid       - The IPFS content identifier to resolve.
 * @param fallbacks - Optional ordered list of fallback gateway base URLs.
 *                    Defaults to {@link DEFAULT_IPFS_FALLBACKS}.
 * @returns The resolved URL string from the fastest-responding gateway.
 *
 * @throws {Error} When all gateways fail or time out without a successful response.
 *
 * @example
 * // Basic usage — uses default fallbacks
 * const url = await ipfsUrl("QmXyz...");
 *
 * @example
 * // Custom fallback list
 * const url = await ipfsUrl("QmXyz...", ["https://my-gateway.example.com/ipfs"]);
 */
export async function ipfsUrl(
  cid: string,
  fallbacks: string[] = DEFAULT_IPFS_FALLBACKS,
): Promise<string> {
  const result = await raceGateways(cid, fallbacks);
  return result.url;
}
