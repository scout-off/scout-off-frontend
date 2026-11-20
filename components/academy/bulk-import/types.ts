import type { BulkImportFileError, ParsedRow } from '@/lib/bulkImportParser';

/**
 * Container phases. `preview` is the review step (parsed rows, nothing
 * submitted yet or a resumed session), `submitting` the sequential import,
 * `done` the summary.
 */
export type Phase = 'upload' | 'preview' | 'submitting' | 'done';

export type RowSubmissionStatus =
  | 'pending'
  | 'signing'
  | 'success'
  | 'failed'
  | 'skipped';

/** A parser file error, or a FileReader failure surfaced the same way. */
export type FileErrorState =
  | BulkImportFileError
  | { code: 'READ_FAILED'; params?: undefined };

export interface RowSubmission {
  status: RowSubmissionStatus;
  txHash?: string | null;
  error?: string | null;
}

export type Submissions = Record<number, RowSubmission>;

export interface ResumedSessionInfo {
  completedRows: number;
  totalRows: number;
}

export type { ParsedRow };
