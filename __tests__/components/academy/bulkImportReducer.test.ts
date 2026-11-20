import {
  bulkImportReducer,
  initialBulkImportState,
  initialRunSubmissions,
  restoreSession,
  type BulkImportState,
} from '@/components/academy/bulk-import/bulkImportReducer';
import { makeRow, sampleRows } from '@/components/academy/bulk-import/fixtures';
import type { BulkImportRowState } from '@/lib/bulkImportStore';

function persisted(
  entries: Array<[number, Partial<BulkImportRowState>]>,
): Map<number, BulkImportRowState> {
  return new Map(
    entries.map(([rowNumber, s]) => [
      rowNumber,
      {
        rowNumber,
        fileHash: 'h',
        status: 'pending',
        ...s,
      } as BulkImportRowState,
    ]),
  );
}

function parsed(overrides: Partial<BulkImportState> = {}): BulkImportState {
  return bulkImportReducer(initialBulkImportState, {
    type: 'FILE_PARSED',
    fileName: 'players.csv',
    sessionId: 'sess-1',
    rows: sampleRows,
    submissions: {},
    resumedSessionInfo: null,
    ...overrides,
  } as never);
}

describe('bulkImportReducer', () => {
  it('moves to preview with the parsed rows', () => {
    const state = parsed();
    expect(state.phase).toBe('preview');
    expect(state.rows).toHaveLength(5);
    expect(state.sessionId).toBe('sess-1');
  });

  it('a parse error clears rows and stays on upload', () => {
    const state = bulkImportReducer(parsed(), {
      type: 'FILE_ERROR',
      error: { code: 'EMPTY_CSV' },
    });
    expect(state.phase).toBe('upload');
    expect(state.rows).toEqual([]);
    expect(state.fileError).toEqual({ code: 'EMPTY_CSV' });
  });

  it('a read failure is surfaced as a file error', () => {
    const state = bulkImportReducer(initialBulkImportState, {
      type: 'READ_FAILED',
    });
    expect(state.fileError).toEqual({ code: 'READ_FAILED' });
  });

  it('selecting a new file clears previous errors', () => {
    let state = bulkImportReducer(initialBulkImportState, {
      type: 'READ_FAILED',
    });
    state = bulkImportReducer(state, { type: 'FORM_ERROR', error: 'x' });
    state = bulkImportReducer(state, { type: 'FILE_SELECTED' });
    expect(state.fileError).toBeNull();
    expect(state.formError).toBeNull();
  });

  it('starting an import hides the resume banner and clears errors', () => {
    let state = parsed({
      resumedSessionInfo: { completedRows: 1, totalRows: 4 },
    });
    state = bulkImportReducer(state, { type: 'FORM_ERROR', error: 'x' });
    state = bulkImportReducer(state, {
      type: 'IMPORT_STARTED',
      submissions: { 1: { status: 'pending' } },
    });
    expect(state.phase).toBe('submitting');
    expect(state.resumedSessionInfo).toBeNull();
    expect(state.formError).toBeNull();
  });

  it('records partial failure per row and finishes in done', () => {
    let state = bulkImportReducer(parsed(), {
      type: 'IMPORT_STARTED',
      submissions: { 1: { status: 'pending' }, 2: { status: 'pending' } },
    });
    state = bulkImportReducer(state, {
      type: 'ROW_UPDATED',
      rowNumber: 1,
      submission: { status: 'success', txHash: 'abc' },
    });
    state = bulkImportReducer(state, {
      type: 'ROW_UPDATED',
      rowNumber: 2,
      submission: { status: 'failed', error: 'rejected' },
    });
    state = bulkImportReducer(state, { type: 'IMPORT_FINISHED' });
    expect(state.phase).toBe('done');
    expect(state.submissions[1]).toEqual({ status: 'success', txHash: 'abc' });
    expect(state.submissions[2]).toEqual({
      status: 'failed',
      error: 'rejected',
    });
  });

  it('pause, resume and cancel toggle the paused flag', () => {
    let state = bulkImportReducer(parsed(), { type: 'PAUSED' });
    expect(state.isPausedBatch).toBe(true);
    state = bulkImportReducer(state, { type: 'RESUMED' });
    expect(state.isPausedBatch).toBe(false);
    state = bulkImportReducer(state, { type: 'PAUSED' });
    state = bulkImportReducer(state, { type: 'CANCEL_REQUESTED' });
    expect(state.isPausedBatch).toBe(false);
  });

  it('a cancelled import returns to preview with an error', () => {
    const state = bulkImportReducer(
      bulkImportReducer(parsed(), { type: 'IMPORT_STARTED', submissions: {} }),
      { type: 'IMPORT_CANCELLED', error: 'Cancelled' },
    );
    expect(state.phase).toBe('preview');
    expect(state.formError).toBe('Cancelled');
  });

  it('reset returns to the initial state', () => {
    expect(bulkImportReducer(parsed(), { type: 'RESET' })).toEqual(
      initialBulkImportState,
    );
  });
});

describe('restoreSession (resume after reload)', () => {
  it('restores persisted row states and shows the resume banner', () => {
    const { submissions, resumedSessionInfo } = restoreSession(
      persisted([
        [1, { status: 'success', txHash: 'tx1' }],
        [2, { status: 'failed', error: 'boom' }],
        [4, { status: 'pending' }],
      ]),
      sampleRows,
    );
    expect(submissions[1]).toEqual({
      status: 'success',
      txHash: 'tx1',
      error: undefined,
    });
    expect(submissions[2].status).toBe('failed');
    expect(resumedSessionInfo).toEqual({ completedRows: 2, totalRows: 4 });
  });

  it('does not show the banner for a fresh session', () => {
    expect(restoreSession(new Map(), sampleRows).resumedSessionInfo).toBeNull();
  });

  it('does not show the banner when the file has no valid rows', () => {
    const { resumedSessionInfo } = restoreSession(
      persisted([[1, { status: 'success' }]]),
      [makeRow(1, false)],
    );
    expect(resumedSessionInfo).toBeNull();
  });
});

describe('initialRunSubmissions (retry)', () => {
  it('keeps succeeded rows and resets failed or pending rows to pending', () => {
    const valid = sampleRows.filter((r) => r.isValid);
    const result = initialRunSubmissions(valid, {
      1: { status: 'success', txHash: 'tx1' },
      2: { status: 'failed', error: 'boom' },
    });
    expect(result).toEqual({
      1: { status: 'success', txHash: 'tx1' },
      2: { status: 'pending' },
      4: { status: 'pending' },
      5: { status: 'pending' },
    });
  });
});
