import { renderHook, act } from '@testing-library/react';
import { useIPFSUpload } from '@/hooks/useIPFSUpload';

// ── Mock XMLHttpRequest ───────────────────────────────────────────────────────
// jsdom's XHR doesn't drive real network requests in this test environment
// anyway, but we replace it with a fully controllable fake so we can trigger
// progress/load/error events deterministically and assert on xhr.open/send.

type Listener = (...args: any[]) => void;

class MockXHR {
  static instances: MockXHR[] = [];

  status = 0;
  responseText = '';
  openedWith: [string, string] | null = null;
  sentBody: FormData | null = null;

  private listeners: Record<string, Listener[]> = {};
  upload = {
    addEventListener: (event: string, cb: Listener) => {
      (this.uploadListeners[event] ??= []).push(cb);
    },
  };
  private uploadListeners: Record<string, Listener[]> = {};

  constructor() {
    MockXHR.instances.push(this);
  }

  addEventListener(event: string, cb: Listener) {
    (this.listeners[event] ??= []).push(cb);
  }

  open(method: string, url: string) {
    this.openedWith = [method, url];
  }

  send(body: FormData) {
    this.sentBody = body;
  }

  fireUploadProgress(e: {
    lengthComputable: boolean;
    loaded: number;
    total: number;
  }) {
    this.uploadListeners['progress']?.forEach((cb) => cb(e));
  }

  fireLoad() {
    this.listeners['load']?.forEach((cb) => cb());
  }

  fireError() {
    this.listeners['error']?.forEach((cb) => cb());
  }
}

function latestXhr(): MockXHR {
  return MockXHR.instances[MockXHR.instances.length - 1];
}

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('useIPFSUpload', () => {
  beforeEach(() => {
    MockXHR.instances = [];
    (global as any).XMLHttpRequest = MockXHR;
  });

  it('initializes with no progress, not uploading, and no error', () => {
    const { result } = renderHook(() => useIPFSUpload());
    expect(result.current.progress).toBe(0);
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('rejects and sets an error for a disallowed file type', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('doc.pdf', 'application/pdf');

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    await expect(promise!).rejects.toThrow(
      'Invalid file type. Only video and image files are allowed.',
    );
    expect(result.current.error).toBe(
      'Invalid file type. Only video and image files are allowed.',
    );
    // No XHR should have been created since validation failed first.
    expect(MockXHR.instances).toHaveLength(0);
  });

  it('rejects and sets an error for an oversized file', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4', 100 * 1024 * 1024 + 1);

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    await expect(promise!).rejects.toThrow(
      'File exceeds the 100 MB size limit.',
    );
    expect(result.current.error).toBe('File exceeds the 100 MB size limit.');
    expect(MockXHR.instances).toHaveLength(0);
  });

  it('accepts an image file (allowed type boundary)', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('photo.png', 'image/png');

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    expect(result.current.uploading).toBe(true);
    expect(latestXhr().openedWith).toEqual(['POST', '/api/ipfs/upload']);

    act(() => {
      latestXhr().status = 200;
      latestXhr().responseText = JSON.stringify({ cid: 'QmImageCid' });
      latestXhr().fireLoad();
    });

    await expect(promise!).resolves.toBe('QmImageCid');
    expect(result.current.uploading).toBe(false);
    expect(result.current.progress).toBe(100);
  });

  it('updates progress when the upload progress event is length-computable', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    act(() => {
      result.current.upload(file);
    });

    act(() => {
      latestXhr().fireUploadProgress({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      });
    });

    expect(result.current.progress).toBe(50);
  });

  it('does not update progress when the upload progress event is not length-computable', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    act(() => {
      result.current.upload(file);
    });

    act(() => {
      latestXhr().fireUploadProgress({
        lengthComputable: false,
        loaded: 50,
        total: 100,
      });
    });

    expect(result.current.progress).toBe(0);
  });

  it('resolves with the parsed CID on a successful (2xx) response', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    act(() => {
      latestXhr().status = 201;
      latestXhr().responseText = JSON.stringify({ cid: 'QmSuccessCid' });
      latestXhr().fireLoad();
    });

    await expect(promise!).resolves.toBe('QmSuccessCid');
  });

  it('rejects with a parse error message when the response body is not valid JSON', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    act(() => {
      latestXhr().status = 200;
      latestXhr().responseText = 'not json';
      latestXhr().fireLoad();
    });

    await expect(promise!).rejects.toThrow(
      'Unexpected response from upload server.',
    );
    expect(result.current.error).toBe(
      'Unexpected response from upload server.',
    );
    expect(result.current.uploading).toBe(false);
  });

  it('rejects with a status error message for a non-2xx response', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    act(() => {
      latestXhr().status = 500;
      latestXhr().fireLoad();
    });

    await expect(promise!).rejects.toThrow('Upload failed with status 500.');
    expect(result.current.error).toBe('Upload failed with status 500.');
  });

  it('rejects with a network error message when the xhr "error" event fires', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(file);
    });

    act(() => {
      latestXhr().fireError();
    });

    await expect(promise!).rejects.toThrow('Network error during upload.');
    expect(result.current.error).toBe('Network error during upload.');
    expect(result.current.uploading).toBe(false);
  });

  it('resets progress and error at the start of each new upload call', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const badFile = makeFile('doc.pdf', 'application/pdf');

    await act(async () => {
      await result.current.upload(badFile).catch(() => {});
    });
    expect(result.current.error).not.toBeNull();

    const goodFile = makeFile('clip.mp4', 'video/mp4');
    let promise: Promise<string>;
    act(() => {
      promise = result.current.upload(goodFile);
    });

    // Error is cleared synchronously at the start of the new upload call.
    expect(result.current.error).toBeNull();

    act(() => {
      latestXhr().status = 200;
      latestXhr().responseText = JSON.stringify({ cid: 'QmRetryCid' });
      latestXhr().fireLoad();
    });
    await expect(promise!).resolves.toBe('QmRetryCid');
  });

  it('sends the file as FormData under the "file" field', async () => {
    const { result } = renderHook(() => useIPFSUpload());
    const file = makeFile('clip.mp4', 'video/mp4');

    act(() => {
      result.current.upload(file);
    });

    const sent = latestXhr().sentBody as FormData;
    expect(sent.get('file')).toBe(file);
  });
});
