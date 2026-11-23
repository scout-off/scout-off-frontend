import { renderHook, act, waitFor } from '@testing-library/react';
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { ChunkedUploadError } from '@/lib/ipfs';

const mockUploadToIPFSChunked = jest.fn();
jest.mock('@/lib/ipfs', () => {
  const actual = jest.requireActual('@/lib/ipfs');
  return {
    ...actual,
    uploadToIPFSChunked: (...args: unknown[]) =>
      mockUploadToIPFSChunked(...args),
  };
});

function makeFile(): File {
  return new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useChunkedUpload', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useChunkedUpload());
    expect(result.current.uploading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.phase).toBe('uploading');
    expect(result.current.error).toBeNull();
    expect(result.current.canResume).toBe(false);
  });

  it('transitions to the processing phase once chunk upload finishes', async () => {
    let resolveUpload!: (cid: string) => void;
    mockUploadToIPFSChunked.mockImplementation(
      (_file, options) =>
        new Promise((resolve) => {
          options.onPhaseChange('uploading');
          options.onProgress(1);
          options.onPhaseChange('processing');
          resolveUpload = resolve;
        }),
    );

    const { result } = renderHook(() => useChunkedUpload());

    act(() => {
      result.current.upload(makeFile());
    });

    await waitFor(() => expect(result.current.phase).toBe('processing'));
    expect(result.current.progress).toBe(100);

    await act(async () => {
      resolveUpload('QmDone');
    });
  });

  it('reports progress and resolves with the CID on success', async () => {
    mockUploadToIPFSChunked.mockImplementation(async (_file, options) => {
      options.onProgress(0.5);
      options.onProgress(1);
      return 'QmSuccess';
    });

    const { result } = renderHook(() => useChunkedUpload());

    let outcome: { cid: string | null; error: string | null } = {
      cid: null,
      error: null,
    };
    await act(async () => {
      outcome = await result.current.upload(makeFile());
    });

    expect(outcome).toEqual({ cid: 'QmSuccess', error: null });
    expect(result.current.progress).toBe(100);
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets uploading true while the upload is in flight', async () => {
    let resolveUpload!: (cid: string) => void;
    mockUploadToIPFSChunked.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const { result } = renderHook(() => useChunkedUpload());

    act(() => {
      result.current.upload(makeFile());
    });

    await waitFor(() => expect(result.current.uploading).toBe(true));

    await act(async () => {
      resolveUpload('QmDone');
    });

    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('exposes a resumable error state and lets resume() continue the same session', async () => {
    const err = new ChunkedUploadError('Upload interrupted.', 'sess-1', 2, 5);
    mockUploadToIPFSChunked.mockRejectedValueOnce(err);
    mockUploadToIPFSChunked.mockResolvedValueOnce('QmResumed');

    const { result } = renderHook(() => useChunkedUpload());

    await act(async () => {
      await result.current.upload(makeFile());
    });

    expect(result.current.error).toBe('Upload interrupted.');
    expect(result.current.canResume).toBe(true);

    let outcome: { cid: string | null; error: string | null } = {
      cid: null,
      error: null,
    };
    await act(async () => {
      outcome = await result.current.resume();
    });

    expect(outcome).toEqual({ cid: 'QmResumed', error: null });
    expect(mockUploadToIPFSChunked).toHaveBeenLastCalledWith(
      expect.any(File),
      expect.objectContaining({ resumeSessionId: 'sess-1' }),
    );
    expect(result.current.canResume).toBe(false);
  });

  it('does not allow resume for a non-resumable error', async () => {
    mockUploadToIPFSChunked.mockRejectedValueOnce(
      new Error('validation failed'),
    );

    const { result } = renderHook(() => useChunkedUpload());

    await act(async () => {
      await result.current.upload(makeFile());
    });

    expect(result.current.canResume).toBe(false);

    let outcome: { cid: string | null; error: string | null } = {
      cid: null,
      error: null,
    };
    await act(async () => {
      outcome = await result.current.resume();
    });
    expect(outcome.cid).toBeNull();
    expect(mockUploadToIPFSChunked).toHaveBeenCalledTimes(1);
  });

  it('starting a new upload clears previous resume state', async () => {
    const err = new ChunkedUploadError('Upload interrupted.', 'sess-1', 1, 4);
    mockUploadToIPFSChunked.mockRejectedValueOnce(err);

    const { result } = renderHook(() => useChunkedUpload());

    await act(async () => {
      await result.current.upload(makeFile());
    });
    expect(result.current.canResume).toBe(true);

    mockUploadToIPFSChunked.mockResolvedValueOnce('QmFresh');
    await act(async () => {
      await result.current.upload(makeFile());
    });

    expect(mockUploadToIPFSChunked).toHaveBeenLastCalledWith(
      expect.any(File),
      expect.objectContaining({ resumeSessionId: undefined }),
    );
  });
});
