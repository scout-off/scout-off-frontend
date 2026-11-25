import type { BulkImportRowState } from '@/lib/bulkImportStore';
import type {
  FileErrorState,
  ParsedRow,
  Phase,
  ResumedSessionInfo,
  RowSubmission,
  RowSubmissionStatus,
  Submissions,
} from './types';

export interface BulkImportState {
  phase: Phase;
  fileName: string;
  fileError: FileErrorState | null;
  rows: ParsedRow[];
  submissions: Submissions;
  formError: string | null;
  sessionId: string | null;
  isPausedBatch: boolean;
  resumedSessionInfo: ResumedSessionInfo | null;
}

export const initialBulkImportState: BulkImportState = {
  phase: 'upload',
  fileName: '',
  fileError: null,
  rows: [],
  submissions: {},
  formError: null,
  sessionId: null,
  isPausedBatch: false,
  resumedSessionInfo: null,
};

export type BulkImportAction =
  | { type: 'FILE_SELECTED' }
  | { type: 'FILE_ERROR'; error: FileErrorState }
  | { type: 'READ_FAILED' }
  | {
      type: 'FILE_PARSED';
      fileName: string;
      sessionId: string;
      rows: ParsedRow[];
      submissions: Submissions;
      resumedSessionInfo: ResumedSessionInfo | null;
    }
  | { type: 'FORM_ERROR'; error: string }
  | { type: 'IMPORT_STARTED'; submissions: Submissions }
  | { type: 'ROW_UPDATED'; rowNumber: number; submission: RowSubmission }
  | { type: 'PAUSED' }
  | { type: 'RESUMED' }
  | { type: 'CANCEL_REQUESTED' }
  | { type: 'IMPORT_CANCELLED'; error: string }
  | { type: 'IMPORT_FINISHED' }
  | { type: 'RESET' };

export function bulkImportReducer(
  state: BulkImportState,
  action: BulkImportAction,
): BulkImportState {
  switch (action.type) {
    case 'FILE_SELECTED':
      return { ...state, fileError: null, formError: null };
    case 'FILE_ERROR':
      return { ...state, fileError: action.error, rows: [], phase: 'upload' };
    case 'READ_FAILED':
      return { ...state, fileError: { code: 'READ_FAILED' } };
    case 'FILE_PARSED':
      return {
        ...state,
        fileName: action.fileName,
        sessionId: action.sessionId,
        rows: action.rows,
        submissions: action.submissions,
        phase: 'preview',
        resumedSessionInfo: action.resumedSessionInfo,
      };
    case 'FORM_ERROR':
      return { ...state, formError: action.error };
    case 'IMPORT_STARTED':
      return {
        ...state,
        formError: null,
        phase: 'submitting',
        resumedSessionInfo: null,
        isPausedBatch: false,
        submissions: action.submissions,
      };
    case 'ROW_UPDATED':
      return {
        ...state,
        submissions: {
          ...state.submissions,
          [action.rowNumber]: action.submission,
        },
      };
    case 'PAUSED':
      return { ...state, isPausedBatch: true };
    case 'RESUMED':
    case 'CANCEL_REQUESTED':
      return { ...state, isPausedBatch: false };
    case 'IMPORT_CANCELLED':
      return {
        ...state,
        isPausedBatch: false,
        phase: 'preview',
        formError: action.error,
      };
    case 'IMPORT_FINISHED':
      return { ...state, phase: 'done' };
    case 'RESET':
      return initialBulkImportState;
    default:
      return state;
  }
}

/**
 * Rebuilds the submission map from a persisted session and decides whether
 * the resume banner should be shown (some rows already finished and the file
 * still has valid rows).
 */
export function restoreSession(
  persistedRows: Map<number, BulkImportRowState>,
  rows: ParsedRow[],
): { submissions: Submissions; resumedSessionInfo: ResumedSessionInfo | null } {
  const submissions: Submissions = {};
  let completedCount = 0;
  persistedRows.forEach((rowState, rowNum) => {
    submissions[rowNum] = {
      status: rowState.status as RowSubmissionStatus,
      txHash: rowState.txHash,
      error: rowState.error,
    };
    if (
      rowState.status === 'success' ||
      rowState.status === 'failed' ||
      rowState.status === 'skipped'
    ) {
      completedCount++;
    }
  });

  const validRowCount = rows.filter((r) => r.isValid).length;
  const resumedSessionInfo =
    completedCount > 0 && validRowCount > 0
      ? { completedRows: completedCount, totalRows: validRowCount }
      : null;

  return { submissions, resumedSessionInfo };
}

/**
 * Submission map at the start of an import run: rows that already succeeded
 * keep their result (so a retry only re-submits failed / pending rows),
 * everything else goes back to pending.
 */
export function initialRunSubmissions(
  validRows: ParsedRow[],
  previous: Submissions,
): Submissions {
  const initial: Submissions = {};
  for (const r of validRows) {
    initial[r.rowNumber] =
      previous[r.rowNumber]?.status === 'success'
        ? previous[r.rowNumber]
        : { status: 'pending' };
  }
  return initial;
}

export function countByStatus(
  submissions: Submissions,
  status: RowSubmissionStatus,
): number {
  return Object.values(submissions).filter((s) => s.status === status).length;
}
