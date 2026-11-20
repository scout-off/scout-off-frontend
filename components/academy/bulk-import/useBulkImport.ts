'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type ChangeEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { buildRegisterPlayer } from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import { extractTxHash } from '@/lib/sorobanTx';
import { parseBulkImportFile, detectFormat } from '@/lib/bulkImportParser';
import {
  hashFileContent,
  getOrCreateSession,
  getSessionRows,
  updateRowStatus,
  deleteSession,
  cleanupExpiredSessions,
} from '@/lib/bulkImportStore';
import type { PlayerVitals } from '@/types';
import {
  bulkImportReducer,
  countByStatus,
  initialBulkImportState,
  initialRunSubmissions,
  restoreSession,
} from './bulkImportReducer';
import type { ParsedRow, RowSubmission } from './types';

// Bulk-imported players are registered without a highlight reel — per-player
// video upload is out of scope for this flow. Players (or the academy, on
// their behalf) can add one later via the single-player profile update flow.
const NO_HIGHLIGHT_REEL_PLACEHOLDER = '';

/**
 * Wraps the bulk-import parser, the resumable session store and the
 * `register_player` contract calls behind the reducer in bulkImportReducer.
 */
export function useBulkImport() {
  const t = useTranslations('academy.bulkImport');
  const { publicKey, signAndSubmit } = useWallet();
  const isPaused = useIsPaused();
  const [state, dispatch] = useReducer(
    bulkImportReducer,
    initialBulkImportState,
  );
  const { rows, submissions, sessionId } = state;

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Refs are used for the loop's hot path so it always reads the latest value
  // without requiring a re-render or suffering from stale closures.
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  const validRows = rows.filter((r) => r.isValid && r.valid);
  const invalidRows = rows.filter((r) => !r.isValid);
  const succeededCount = countByStatus(submissions, 'success');
  const failedCount = countByStatus(submissions, 'failed');

  // On mount, clean up expired sessions
  useEffect(() => {
    cleanupExpiredSessions().catch(console.error);
  }, []);

  const setRow = (rowNumber: number, submission: RowSubmission) =>
    dispatch({ type: 'ROW_UPDATED', rowNumber, submission });

  const resetAll = () => {
    pausedRef.current = false;
    cancelledRef.current = false;
    dispatch({ type: 'RESET' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReset = async () => {
    if (sessionId) {
      await deleteSession(sessionId);
    }
    resetAll();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    dispatch({ type: 'FILE_SELECTED' });

    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? '');
      const format = detectFormat(file.name, text);
      const result = parseBulkImportFile(text, format);

      if (result.fileError) {
        dispatch({ type: 'FILE_ERROR', error: result.fileError });
        return;
      }

      // The file hash lets a re-selected file resume its previous session.
      const hash = await hashFileContent(text);
      const session = await getOrCreateSession(hash, file.name);
      const persistedRows = await getSessionRows(session.sessionId);
      const restored = restoreSession(persistedRows, result.rows);

      dispatch({
        type: 'FILE_PARSED',
        fileName: file.name,
        sessionId: session.sessionId,
        rows: result.rows,
        ...restored,
      });
    };
    reader.onerror = () => {
      dispatch({ type: 'READ_FAILED' });
    };
    reader.readAsText(file);
  };

  // ── Sequential, one-signature-per-row submission ────────────────────────────
  //
  // One connected wallet submits N sequential `register_player` transactions,
  // one per valid row, each needing its own approval. A failed or rejected row
  // is marked failed and the batch continues, so one bad row doesn't cost the
  // rest of the batch.
  //
  // Pausing waits (polling every 200ms) before the *next* row's signature
  // prompt; in-flight signatures finish. Cancelling breaks the loop and resets
  // unfinished rows to pending so they can be retried on resume.
  const handleImport = async () => {
    if (!publicKey) {
      dispatch({ type: 'FORM_ERROR', error: t('walletNotConnected') });
      return;
    }
    if (isPaused) {
      dispatch({ type: 'FORM_ERROR', error: t('transactionsDisabled') });
      return;
    }
    if (validRows.length === 0) return;

    pausedRef.current = false;
    cancelledRef.current = false;
    dispatch({
      type: 'IMPORT_STARTED',
      submissions: initialRunSubmissions(validRows, submissions),
    });

    for (const r of validRows) {
      if (cancelledRef.current) break;

      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (cancelledRef.current) break;

      // Skip rows that already succeeded
      if (submissions[r.rowNumber]?.status === 'success') continue;

      const vitals = r.valid as NonNullable<ParsedRow['valid']>;

      setRow(r.rowNumber, { status: 'signing' });
      if (sessionId) {
        await updateRowStatus(sessionId, r.rowNumber, 'signing');
      }

      try {
        const payload: PlayerVitals = {
          name: vitals.name,
          age: vitals.age,
          position: vitals.position,
          region: vitals.region,
          nationality: vitals.nationality,
        };
        const xdr = await buildRegisterPlayer(
          publicKey,
          payload,
          NO_HIGHLIGHT_REEL_PLACEHOLDER,
        );
        // Don't raise a wallet prompt for a row the admin already abandoned.
        if (cancelledRef.current) break;
        const result = await signAndSubmit(xdr);
        const hash = extractTxHash(result);

        setRow(r.rowNumber, { status: 'success', txHash: hash });
        if (sessionId) {
          await updateRowStatus(sessionId, r.rowNumber, 'success', hash);
        }
      } catch (err) {
        const errorMsg = parseContractError(err);
        setRow(r.rowNumber, { status: 'failed', error: errorMsg });
        if (sessionId) {
          await updateRowStatus(
            sessionId,
            r.rowNumber,
            'failed',
            null,
            errorMsg,
          );
        }
      }
    }

    if (cancelledRef.current) {
      // Mark unfinished rows pending so they are recognized on resume.
      for (const r of validRows) {
        const current = submissions[r.rowNumber];
        if (
          current &&
          current.status !== 'success' &&
          current.status !== 'failed'
        ) {
          setRow(r.rowNumber, { status: 'pending' });
          if (sessionId) {
            await updateRowStatus(sessionId, r.rowNumber, 'pending');
          }
        }
      }
      dispatch({ type: 'IMPORT_CANCELLED', error: t('batchCancelled') });
    } else {
      dispatch({ type: 'IMPORT_FINISHED' });
    }
  };

  const handlePause = useCallback(() => {
    pausedRef.current = true;
    dispatch({ type: 'PAUSED' });
  }, []);

  const handleResume = useCallback(() => {
    pausedRef.current = false;
    dispatch({ type: 'RESUMED' });
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    dispatch({ type: 'CANCEL_REQUESTED' });
  }, []);

  return {
    state,
    publicKey,
    isPaused,
    fileInputRef,
    validRows,
    invalidRows,
    succeededCount,
    failedCount,
    handleFileChange,
    handleImport,
    handlePause,
    handleResume,
    handleCancel,
    handleReset,
  };
}
