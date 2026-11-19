'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  uploadToIPFSChunked,
  getChunkedUploadStatus,
  ChunkedUploadError,
  type ChunkedUploadPhase,
} from '@/lib/ipfs';
import {
  saveResumeState,
  loadResumeState,
  clearResumeState,
  type PersistedUploadState,
} from '@/lib/uploadResumeStore';

export type { PersistedUploadState };

export interface UploadOutcome {
  cid: string | null;
  error: string | null;
}

/**
 * Optional client-side compression step (issue #1679). When enabled and
 * supported, the video is re-encoded to a delivery profile (≤720p, ~2.5 Mbps)
 * in a Web Worker before the chunked upload starts, cutting the uploader's
 * mobile data usage. Progressive enhancement: unsupported browsers upload the
 * original untouched.
 */
export interface CompressionOptions {
  /** Defaults to true. Set false to upload the original file. */
  enabled?: boolean;
  /** Called with [0, 1] as the worker re-encodes. */
  onProgress?: (fraction: number) => void;
  /** Aborts the in-flight compression; the original file is uploaded instead. */
  signal?: AbortSignal;
}

export interface CompressionResult {
  /** The file to upload — compressed output, or the original on fallback. */
  file: File;
  /** True when the returned file is the re-encoded output. */
  compressed: boolean;
  /** Original size in bytes. */
  originalSize: number;
  /** Human-readable reason when compression was skipped/fell back. */
  reason?: string;
}

export interface UseChunkedUploadResult {
  /** Upload progress in [0, 100]. Only meaningful during the 'uploading' phase. */
  progress: number;
  /** 'uploading' (chunks in transit) vs 'processing' (server pinning to IPFS). */
  phase: ChunkedUploadPhase;
  uploading: boolean;
  error: string | null;
  /** Seconds until the rate limit expires, if the error was a 429 response. */
  retryAfterSec: number | null;
  /** True after an interrupted upload that can continue from its last chunk. */
  canResume: boolean;
  /**
   * Compression progress in [0, 100] while the worker re-encodes, or null when
   * no compression is running. Reported separately from `progress` so the UI
   * can distinguish "compressing" from "uploading".
   */
  compressionProgress: number | null;
  /**
   * Starts a fresh chunked upload for `file`. When `compression` is enabled
   * (the default) and WebCodecs is supported, the file is re-encoded first.
   */
  upload: (file: File, compression?: CompressionOptions) => Promise<UploadOutcome>;
  /** Continues the most recently interrupted upload from its last successful chunk. */
  resume: () => Promise<UploadOutcome>;
  /**
   * Persisted session recovered from localStorage on mount.
   * Non-null when a previous upload was interrupted and its metadata survived
   * a page reload (and the server-side 2 hr TTL has not yet elapsed).
   * Cleared automatically once `promptResume` completes (success or failure)
   * or when `clearResumeState` is called explicitly.
   */
  persistedSession: PersistedUploadState | null;
  /**
   * Validates that `file` matches the persisted session (name + size), checks
   * whether the server-side session still exists, then resumes from the last
   * successfully received chunk.
   *
   * Returns `{ cid: null, error: '...' }` when:
   * - There is no persisted session to resume.
   * - The provided file does not match the stored session (by name AND size).
   * - The server-side session has already expired (404 from /status).
   *
   * On mismatch the persisted state is cleared so a fresh upload can begin.
   */
  promptResume: (file: File) => Promise<UploadOutcome>;
}

/**
 * Feature-detects WebCodecs video encode/decode support for a delivery
 * profile (H.264 Baseline `avc1.42E01F` or VP9 `vp09.*`). Returns false on
 * older Android WebViews / Firefox ESR so callers fall back to the original.
 */
async function isWebCodecsSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const g = window as unknown as {
    VideoEncoder?: { isConfigSupported?: (c: unknown) => Promise<{ supported?: boolean }> };
    VideoDecoder?: { isConfigSupported?: (c: unknown) => Promise<{ supported?: boolean }> };
  };
  if (!g.VideoEncoder?.isConfigSupported || !g.VideoDecoder?.isConfigSupported) {
    return false;
  }
  const candidates = [
    { codec: 'avc1.42E01F', width: 1280, height: 720, bitrate: 2_500_000 },
    { codec: 'vp09.00.10.08', width: 1280, height: 720, bitrate: 2_500_000 },
  ];
  for (const config of candidates) {
    try {
      const enc = await g.VideoEncoder.isConfigSupported(config);
      const dec = await g.VideoDecoder.isConfigSupported(config);
      if (enc?.supported && dec?.supported) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

/**
 * Runs the compression worker. The worker (and its lazy-loaded demuxer/muxer)
 * is only imported here, inside the upload step, so route bundles stay small.
 * Resolves with the compressed file, or the original when the worker reports
 * a fallback (unsupported codec, budget exceeded, backgrounded tab, cancel).
 */
async function compressInWorker(
  file: File,
  options: CompressionOptions,
): Promise<CompressionResult> {
  const originalSize = file.size;
  const fallback = (reason: string): CompressionResult => ({
    file,
    compressed: false,
    originalSize,
    reason,
  });

  if (options.enabled === false) return fallback('disabled');
  if (!(await isWebCodecsSupported())) return fallback('unsupported');

  try {
    const { compressVideo } = await import('@/lib/videoCompression');
    const blob = await compressVideo(file, {
      onProgress: options.onProgress,
      signal: options.signal,
    });
    if (!blob || blob.size === 0 || blob.size >= originalSize) {
      return fallback('no-savings');
    }
    const out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.mp4', {
      type: blob.type || 'video/mp4',
    });
    return { file: out, compressed: true, originalSize };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? 'cancelled'
        : 'compression-failed';
    return fallback(reason);
  }
}

/**
 * Drives lib/ipfs.ts's chunked/resumable upload for a single file, exposing
 * progress and a resume affordance for VideoUpload (issue #664 — chunked
 * uploads on unreliable mobile connections, paired with the
 * upload-progress-indicator issue this fulfils).
 *
 * `upload`/`resume` resolve with the outcome directly (`{ cid, error }`)
 * rather than requiring callers to read the hook's `error` state right
 * after awaiting — reading component-scope state immediately after an
 * await risks a stale closure from before the state update landed. The
 * `error`/`canResume` state is still exposed for rendering (e.g. showing a
 * persistent "Resume upload" button after the call site's own logic runs).
 *
 * Issue #1003: `persistedSession` and `promptResume` extend the hook with
 * cross-reload resume capability. Session metadata (sessionId, filename,
 * fileSize, fileType, totalChunks) is saved to localStorage when an upload
 * is interrupted and cleared on success or expiry. The File object itself
 * cannot be serialized — the caller must re-supply the file when resuming.
 *
 * Issue #1679: `upload` optionally re-encodes the video in a Web Worker
 * before the chunked upload starts. The compressed output becomes the upload
 * source; resume state records the compressed file's name/size, so a reload
 * mid-upload resumes against the compressed bytes (the caller re-supplies the
 * original file and compression is re-run deterministically to reproduce the
 * same output). Unsupported browsers upload the original with no errors.
 */
export function useChunkedUpload(): UseChunkedUploadResult {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<ChunkedUploadPhase>('uploading');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<number | null>(
    null,
  );
  const [persistedSession, setPersistedSession] =
    useState<PersistedUploadState | null>(null);

  const resumeStateRef = useRef<{ file: File; sessionId: string } | null>(null);

  // On mount: restore any persisted session from localStorage. loadResumeState
  // already handles TTL expiry and clears stale entries automatically.
  useEffect(() => {
    const stored = loadResumeState();
    setPersistedSession(stored);
  }, []);

  const runUpload = useCallback(
    async (file: File, resumeSessionId?: string): Promise<UploadOutcome> => {
      setUploading(true);
      setError(null);
      setRetryAfterSec(null);

      try {
        const cid = await uploadToIPFSChunked(file, {
          resumeSessionId,
          onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
          onPhaseChange: setPhase,
        });
        resumeStateRef.current = null;
        setCanResume(false);
        setProgress(100);
        // Successful completion — clear the persisted session so a fresh
        // upload is not mistakenly offered as resumable after the next reload.
        clearResumeState();
        setPersistedSession(null);
        return { cid, error: null };
      } catch (err) {
        if (err instanceof ChunkedUploadError) {
          resumeStateRef.current = { file, sessionId: err.sessionId };
          setCanResume(true);
          setRetryAfterSec(err.retryAfterSec ?? null);
          // Persist resumable session metadata to localStorage so the user
          // can continue after a page reload (issue #1003).
          const state: PersistedUploadState = {
            sessionId: err.sessionId,
            filename: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: err.totalChunks,
            savedAt: Date.now(),
          };
          saveResumeState(state);
          setPersistedSession(state);
        } else {
          resumeStateRef.current = null;
          setCanResume(false);
          setRetryAfterSec(null);
        }
        const message =
          (err as { response?: { status?: number } })?.response?.status === 503
            ? 'Video uploads are temporarily unavailable. Please try again later.'
            : err instanceof Error
              ? err.message
              : 'Upload failed. Please try again.';
        setError(message);
        return { cid: null, error: message };
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const upload = useCallback(
    async (file: File, compression?: CompressionOptions): Promise<UploadOutcome> => {
      resumeStateRef.current = null;
      setCanResume(false);
      setProgress(0);

      // Optional client-side compression before the chunked upload starts.
      // Falls back to the original file on unsupported browsers, cancel, or
      // when the output would not be smaller.
      let source = file;
      setCompressionProgress(0);
      try {
        const result = await compressInWorker(file, {
          ...compression,
          onProgress: (fraction) => {
            setCompressionProgress(Math.round(fraction * 100));
            compression?.onProgress?.(fraction);
          },
        });
        source = result.file;
      } finally {
        setCompressionProgress(null);
      }

      return runUpload(source);
    },
    [runUpload],
  );

  const resume = useCallback(() => {
    const state = resumeStateRef.current;
    if (!state) return Promise.resolve({ cid: null, error: null });
    return runUpload(state.file, state.sessionId);
  }, [runUpload]);

  /**
   * Cross-reload resume: validates the supplied file against the persisted
   * session, confirms the server-side session still exists, then resumes.
   *
   * Validation is intentionally strict (name AND size) — a file with the
   * same name but a different byte-count is almost certainly a different
   * recording, and sending mismatched chunks would corrupt the assembly.
   *
   * Issue #1679: when the interrupted upload used a compressed source, the
   * persisted filename/size refer to the compressed output. The caller
   * re-supplies the original file; we re-run compression deterministically
   * to reproduce the same bytes before resuming.
   */
  const promptResume = useCallback(
    async (file: File): Promise<UploadOutcome> => {
      const stored = loadResumeState();
      if (!stored) {
        return {
          cid: null,
          error: 'No interrupted upload session found.',
        };
      }

      // Validate that the re-supplied file matches the original session.
      // If it does not match directly, it may be the original file whose
      // compressed output was the upload source — re-compress to reproduce.
      let source = file;
      if (file.name !== stored.filename || file.size !== stored.fileSize) {
        setCompressionProgress(0);
        try {
          const result = await compressInWorker(file, {
            onProgress: (fraction) =>
              setCompressionProgress(Math.round(fraction * 100)),
          });
          source = result.file;
        } finally {
          setCompressionProgress(null);
        }
      }

      if (source.name !== stored.filename || source.size !== stored.fileSize) {
        clearResumeState();
        setPersistedSession(null);
        return {
          cid: null,
          error:
            'Selected file does not match the interrupted upload. Starting fresh.',
        };
      }

      // Confirm the server-side session still exists before attempting to
      // resume — avoids a confusing error mid-stream if the session expired
      // between page reload and the user clicking "Resume".
      try {
        await getChunkedUploadStatus(stored.sessionId);
      } catch {
        // 404 or network error — the server-side session has expired.
        clearResumeState();
        setPersistedSession(null);
        return {
          cid: null,
          error: 'The interrupted upload has expired. Please start a new upload.',
        };
      }

      return runUpload(source, stored.sessionId);
    },
    [runUpload],
  );

  return {
    progress,
    phase,
    uploading,
    error,
    retryAfterSec,
    canResume,
    compressionProgress,
    upload,
    resume,
    persistedSession,
    promptResume,
  };
}
