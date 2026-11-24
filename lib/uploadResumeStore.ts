import { UPLOAD_RESUME_KEY } from '@/lib/storageKeys';

/**
 * localStorage-backed persistence for interrupted chunked uploads.
 *
 * File objects cannot be serialized, but the session metadata needed to
 * resume — sessionId, filename, fileSize, fileType, totalChunks — can be.
 * On the next page load the hook reads this store, detects a resumable
 * session, and surfaces a `promptResume` affordance to the user.
 *
 * TTL matches the server-side SESSION_TTL_MS in lib/chunkedUploadStore.ts
 * (2 hours). A stored entry older than the TTL is treated as expired and
 * cleared on the next read.
 */

/** localStorage key used to store the single persisted upload session. */
export { UPLOAD_RESUME_KEY };

/** Must match the server-side SESSION_TTL_MS in lib/chunkedUploadStore.ts */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Serializable snapshot of an interrupted upload session that can be
 * persisted to localStorage and recovered after a page reload.
 */
export interface PersistedUploadState {
  /** The server-side upload session identifier. */
  sessionId: string;
  /** Original filename — used to validate the user re-selects the correct file. */
  filename: string;
  /** Original file size in bytes — used alongside filename for validation. */
  fileSize: number;
  /** MIME type of the original file. */
  fileType: string;
  /** Total number of chunks the server expects for this session. */
  totalChunks: number;
  /** Unix timestamp (ms) when this state was saved. Used for TTL checks. */
  savedAt: number;
}

/**
 * Saves the resume state for an interrupted upload to localStorage.
 * Overwrites any previously stored state — only one interrupted session is
 * tracked at a time (matching the hook's single-session design).
 *
 * Safe to call in SSR contexts: the `typeof window` guard prevents
 * `localStorage` access during server-side rendering.
 */
export function saveResumeState(state: PersistedUploadState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UPLOAD_RESUME_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or blocked (e.g. private browsing). Fail silently —
    // the upload still works; it just can't be resumed after a reload.
  }
}

/**
 * Loads a previously persisted upload resume state from localStorage.
 *
 * Returns `null` if:
 * - There is no stored state.
 * - The stored JSON is malformed.
 * - The stored state is older than {@link SESSION_TTL_MS} (the server-side
 *   session will have expired anyway, so resuming is not possible).
 *
 * When the TTL check fails, the stale entry is removed automatically.
 *
 * Safe to call in SSR contexts.
 */
export function loadResumeState(): PersistedUploadState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(UPLOAD_RESUME_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw) as PersistedUploadState;

    if (Date.now() - state.savedAt > SESSION_TTL_MS) {
      clearResumeState();
      return null;
    }

    return state;
  } catch {
    // Malformed JSON or storage access error — treat as no state.
    clearResumeState();
    return null;
  }
}

/**
 * Removes the persisted upload resume state from localStorage.
 *
 * Called when:
 * - An upload completes successfully.
 * - The user selects a different file that doesn't match the stored session.
 * - The stored session has expired.
 *
 * Safe to call in SSR contexts and when no state is currently stored.
 */
export function clearResumeState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(UPLOAD_RESUME_KEY);
  } catch {
    // Ignore storage errors.
  }
}
