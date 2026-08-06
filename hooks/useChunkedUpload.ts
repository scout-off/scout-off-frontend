'use client';

import { useCallback, useRef, useState } from 'react';
import {
  uploadToIPFSChunked,
  ChunkedUploadError,
  type ChunkedUploadPhase,
} from '@/lib/ipfs';

export interface UploadOutcome {
  cid: string | null;
  error: string | null;
}

export interface UseChunkedUploadResult {
  /** Upload progress in [0, 100]. Only meaningful during the 'uploading' phase. */
  progress: number;
  /** 'uploading' (chunks in transit) vs 'processing' (server pinning to IPFS). */
  phase: ChunkedUploadPhase;
  uploading: boolean;
  error: string | null;
  /** True after an interrupted upload that can continue from its last chunk. */
  canResume: boolean;
  /** Starts a fresh chunked upload for `file`. */
  upload: (file: File) => Promise<UploadOutcome>;
  /** Continues the most recently interrupted upload from its last successful chunk. */
  resume: () => Promise<UploadOutcome>;
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
 */
export function useChunkedUpload(): UseChunkedUploadResult {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<ChunkedUploadPhase>('uploading');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);

  const resumeStateRef = useRef<{ file: File; sessionId: string } | null>(null);

  const runUpload = useCallback(
    async (file: File, resumeSessionId?: string): Promise<UploadOutcome> => {
      setUploading(true);
      setError(null);

      try {
        const cid = await uploadToIPFSChunked(file, {
          resumeSessionId,
          onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
          onPhaseChange: setPhase,
        });
        resumeStateRef.current = null;
        setCanResume(false);
        setProgress(100);
        return { cid, error: null };
      } catch (err) {
        if (err instanceof ChunkedUploadError) {
          resumeStateRef.current = { file, sessionId: err.sessionId };
          setCanResume(true);
        } else {
          resumeStateRef.current = null;
          setCanResume(false);
        }
        const message =
          err instanceof Error
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
    (file: File) => {
      resumeStateRef.current = null;
      setCanResume(false);
      setProgress(0);
      return runUpload(file);
    },
    [runUpload],
  );

  const resume = useCallback(() => {
    const state = resumeStateRef.current;
    if (!state) return Promise.resolve({ cid: null, error: null });
    return runUpload(state.file, state.sessionId);
  }, [runUpload]);

  return { progress, phase, uploading, error, canResume, upload, resume };
}
