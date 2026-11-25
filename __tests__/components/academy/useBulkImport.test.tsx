import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { useBulkImport } from '@/components/academy/bulk-import/useBulkImport';
import { useWallet } from '@/hooks/useWallet';
import { buildRegisterPlayer } from '@/lib/contract';
import { getSessionRows, updateRowStatus } from '@/lib/bulkImportStore';
import type { BulkImportRowState } from '@/lib/bulkImportStore';

jest.mock('@/hooks/useWallet', () => ({ useWallet: jest.fn() }));
jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(false),
}));
jest.mock('@/lib/contract', () => ({ buildRegisterPlayer: jest.fn() }));
jest.mock('@/lib/bulkImportStore', () => ({
  hashFileContent: jest.fn().mockResolvedValue('hash'),
  getOrCreateSession: jest.fn().mockResolvedValue({ sessionId: 'sess-1' }),
  getSessionRows: jest.fn().mockResolvedValue(new Map()),
  updateRowStatus: jest.fn().mockResolvedValue(undefined),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  cleanupExpiredSessions: jest.fn().mockResolvedValue(undefined),
}));

const mockedUseWallet = useWallet as jest.Mock;
const mockedBuild = buildRegisterPlayer as jest.Mock;
const mockedGetSessionRows = getSessionRows as jest.Mock;
const mockedUpdateRowStatus = updateRowStatus as jest.Mock;

const CSV = [
  'name,age,nationality,region,position',
  'John Doe,22,Nigerian,nigeria,ST',
  'Jane Smith,19,Kenyan,kenya,GK',
  'Bad Row,abc,Kenyan,kenya,GK',
].join('\n');

function changeEvent(content: string, name = 'players.csv') {
  const file = new File([content], name, { type: 'text/csv' });
  return {
    target: { files: [file] },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

async function loadFile(result: { current: ReturnType<typeof useBulkImport> }) {
  act(() => result.current.handleFileChange(changeEvent(CSV)));
  await waitFor(() => expect(result.current.state.phase).toBe('preview'));
}

describe('useBulkImport', () => {
  let signAndSubmit: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSessionRows.mockResolvedValue(new Map());
    mockedBuild.mockResolvedValue('xdr');
    signAndSubmit = jest.fn().mockResolvedValue({ hash: 'tx' });
    mockedUseWallet.mockReturnValue({ publicKey: 'GKEY', signAndSubmit });
  });

  it('parses a file into valid and invalid rows', async () => {
    const { result } = renderHook(() => useBulkImport());
    await loadFile(result);
    expect(result.current.validRows).toHaveLength(2);
    expect(result.current.invalidRows).toHaveLength(1);
  });

  it('surfaces a parse error and stays on upload', async () => {
    const { result } = renderHook(() => useBulkImport());
    act(() => result.current.handleFileChange(changeEvent('')));
    await waitFor(() => expect(result.current.state.fileError).not.toBeNull());
    expect(result.current.state.phase).toBe('upload');
  });

  it('continues past a failed row and reports partial failure', async () => {
    signAndSubmit
      .mockRejectedValueOnce(new Error('rejected'))
      .mockResolvedValueOnce({ hash: 'tx2' });
    const { result } = renderHook(() => useBulkImport());
    await loadFile(result);

    await act(async () => {
      await result.current.handleImport();
    });

    expect(result.current.state.phase).toBe('done');
    expect(result.current.failedCount).toBe(1);
    expect(result.current.succeededCount).toBe(1);
    expect(mockedUpdateRowStatus).toHaveBeenCalledWith(
      'sess-1',
      1,
      'failed',
      null,
      expect.any(String),
    );
  });

  it('resumes a persisted session and only re-submits unfinished rows', async () => {
    mockedGetSessionRows.mockResolvedValue(
      new Map<number, BulkImportRowState>([
        [
          1,
          {
            rowNumber: 1,
            fileHash: 'hash',
            status: 'success',
            txHash: 'tx1',
          } as BulkImportRowState,
        ],
      ]),
    );
    const { result } = renderHook(() => useBulkImport());
    await loadFile(result);
    expect(result.current.state.resumedSessionInfo).toEqual({
      completedRows: 1,
      totalRows: 2,
    });

    await act(async () => {
      await result.current.handleImport();
    });

    expect(signAndSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.succeededCount).toBe(2);
  });

  it('retries only the failed rows on a second run', async () => {
    signAndSubmit.mockRejectedValueOnce(new Error('rejected'));
    const { result } = renderHook(() => useBulkImport());
    await loadFile(result);

    await act(async () => {
      await result.current.handleImport();
    });
    expect(result.current.failedCount).toBe(1);
    signAndSubmit.mockClear();

    await act(async () => {
      await result.current.handleImport();
    });

    expect(signAndSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.failedCount).toBe(0);
    expect(result.current.succeededCount).toBe(2);
  });

  it('refuses to import without a connected wallet', async () => {
    mockedUseWallet.mockReturnValue({ publicKey: null, signAndSubmit });
    const { result } = renderHook(() => useBulkImport());
    await loadFile(result);

    await act(async () => {
      await result.current.handleImport();
    });

    expect(result.current.state.formError).toBeTruthy();
    expect(signAndSubmit).not.toHaveBeenCalled();
  });
});
