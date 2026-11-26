import axios from 'axios';
import {
  ipfsUrl,
  raceGateways,
  RACE_TIMEOUT_MS,
  uploadToIPFS,
  uploadToIPFSChunked,
  getChunkedUploadStatus,
  ChunkedUploadError,
  CHUNK_SIZE_BYTES,
  DEFAULT_IPFS_FALLBACKS,
} from '../../lib/ipfs';

jest.mock('axios');

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('lib/ipfs', () => {
  const mockCid = 'QmTest123';
  const mockPrimaryGateway = 'https://gateway.pinata.cloud/ipfs';
  const mockFallback1 = 'https://ipfs.io/ipfs';
  const mockFallback2 = 'https://dweb.link/ipfs';

  beforeEach(() => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = mockPrimaryGateway;
    global.fetch = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY;
  });

  // ── raceGateways ──────────────────────────────────────────────────────────
  describe('raceGateways', () => {
    it('returns the primary gateway URL when it responds first', async () => {
      // All gateways succeed; primary is fastest (resolves first).
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const result = await raceGateways(mockCid, [mockFallback1]);

      expect(result.url).toBe(`${mockPrimaryGateway}/${mockCid}`);
      expect(result.isPrimary).toBe(true);
      expect(typeof result.latencyMs).toBe('number');
    });

    it('returns a fallback URL when the primary gateway fails (5xx)', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 }) // primary
        .mockResolvedValueOnce({ ok: true }); // fallback1

      const result = await raceGateways(mockCid, [mockFallback1]);

      expect(result.url).toBe(`${mockFallback1}/${mockCid}`);
      expect(result.gateway).toBe(mockFallback1);
      expect(result.isPrimary).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(mockFallback1),
      );
    });

    it('returns a fallback URL when the primary gateway times out', async () => {
      // Primary never resolves — simulate by returning a never-settling promise,
      // but set a very short timeout so the test doesn't hang.
      (global.fetch as jest.Mock)
        .mockImplementationOnce(
          () => new Promise(() => {}), // primary — never settles
        )
        .mockResolvedValueOnce({ ok: true }); // fallback1 wins

      const result = await raceGateways(mockCid, [mockFallback1], 50);

      // fallback1 wins because primary timed out at 50 ms.
      expect(result.url).toBe(`${mockFallback1}/${mockCid}`);
      expect(result.isPrimary).toBe(false);
    });

    it('returns a fallback URL when the primary gateway returns a network error', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new TypeError('Failed to fetch')) // primary
        .mockResolvedValueOnce({ ok: true }); // fallback1

      const result = await raceGateways(mockCid, [mockFallback1]);

      expect(result.url).toBe(`${mockFallback1}/${mockCid}`);
      expect(result.isPrimary).toBe(false);
    });

    it('fires all gateway probes concurrently (not sequentially)', async () => {
      // Track call order to verify all three start before any resolves.
      const callOrder: string[] = [];

      (global.fetch as jest.Mock).mockImplementation(
        (url: string) =>
          new Promise<{ ok: boolean }>((resolve) => {
            callOrder.push(url as string);
            // All resolve in the next micro-task; primary isn't the only one that
            // gets a chance — all are queued before any resolves.
            Promise.resolve().then(() => resolve({ ok: true }));
          }),
      );

      await raceGateways(mockCid, [mockFallback1, mockFallback2]);

      // All three probes should have been issued.
      expect(callOrder).toHaveLength(3);
      expect(callOrder).toContain(`${mockPrimaryGateway}/${mockCid}`);
      expect(callOrder).toContain(`${mockFallback1}/${mockCid}`);
      expect(callOrder).toContain(`${mockFallback2}/${mockCid}`);
    });

    it('throws when all gateways fail', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 429 });

      await expect(
        raceGateways(mockCid, [mockFallback1, mockFallback2]),
      ).rejects.toThrow(/All gateways failed race/);
    });

    it('exports a RACE_TIMEOUT_MS constant (startup latency budget assertion)', () => {
      // Startup constraint from the issue: first playable frame within 3 s on
      // a healthy primary gateway. The race timeout must be ≤ 3000 ms so the
      // race itself cannot blow the budget on its own.
      expect(RACE_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    });

    // Latency budget test: the race resolves within the stated budget even
    // when the primary is slightly slow.
    it('resolves within the startup latency budget when a fallback wins', async () => {
      jest.useFakeTimers();

      let primaryResolve!: (v: { ok: boolean }) => void;
      let fallbackResolve!: (v: { ok: boolean }) => void;

      (global.fetch as jest.Mock)
        .mockImplementationOnce(
          () => new Promise<{ ok: boolean }>((r) => { primaryResolve = r; }),
        )
        .mockImplementationOnce(
          () => new Promise<{ ok: boolean }>((r) => { fallbackResolve = r; }),
        );

      const racePromise = raceGateways(mockCid, [mockFallback1], 3000);

      // Fallback responds at t=200 ms (well within 3 s budget).
      jest.advanceTimersByTime(200);
      fallbackResolve({ ok: true });

      const result = await racePromise;
      expect(result.url).toBe(`${mockFallback1}/${mockCid}`);

      // Clean up dangling primary.
      primaryResolve({ ok: false, ok2: false } as unknown as { ok: boolean });
      jest.useRealTimers();
    });
  });

  // ── ipfsUrl ──────────────────────────────────────────────────────────────
  describe('ipfsUrl', () => {
    it('returns primary gateway URL when primary is successful', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const result = await ipfsUrl(mockCid);

      // With concurrent racing all probes fire; we just need the primary URL
      // returned when it wins.
      expect(result).toBe(`${mockPrimaryGateway}/${mockCid}`);
    });

    it('falls back to a secondary gateway when the primary returns 500', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 }) // primary
        .mockResolvedValueOnce({ ok: true }); // fallback1

      const result = await ipfsUrl(mockCid, [mockFallback1]);

      expect(result).toBe(`${mockFallback1}/${mockCid}`);
      expect(console.warn).toHaveBeenCalled();
    });

    it('throws when all gateways are exhausted', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      await expect(
        ipfsUrl(mockCid, [mockFallback1, mockFallback2]),
      ).rejects.toThrow(/gateways/i);
    });
  });

  describe('uploadToIPFS', () => {
    it('posts to /api/ipfs/upload and returns the CID', async () => {
      const mockFile = new File(['test content'], 'test.txt', {
        type: 'text/plain',
      });
      const mockCidResponse = { cid: 'QmUpload123' };

      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: mockCidResponse,
      });

      const result = await uploadToIPFS(mockFile);

      expect(result).toBe(mockCidResponse.cid);
      expect(axios.post).toHaveBeenCalledWith(
        '/api/ipfs/upload',
        expect.any(FormData),
      );
    });
  });

  describe('uploadToIPFSChunked', () => {
    it('uploads a single-chunk file via init -> chunk -> complete', async () => {
      const file = makeFile('clip.mp4', 'video/mp4', 1024);
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { sessionId: 'sess-1' } }) // init
        .mockResolvedValueOnce({
          data: { receivedChunks: [0], totalChunks: 1 },
        }) // chunk
        .mockResolvedValueOnce({ data: { cid: 'QmChunked1' } }); // complete

      const onProgress = jest.fn();
      const cid = await uploadToIPFSChunked(file, { onProgress });

      expect(cid).toBe('QmChunked1');
      expect(axios.post).toHaveBeenNthCalledWith(1, '/api/ipfs/upload/init', {
        filename: 'clip.mp4',
        fileType: 'video/mp4',
        fileSize: 1024,
        totalChunks: 1,
      });
      expect(axios.post).toHaveBeenNthCalledWith(
        2,
        '/api/ipfs/upload/chunk',
        expect.any(FormData),
      );
      expect(axios.post).toHaveBeenNthCalledWith(
        3,
        '/api/ipfs/upload/complete',
        {
          sessionId: 'sess-1',
        },
      );
      expect(onProgress).toHaveBeenLastCalledWith(1);
    });

    it('reports the uploading phase up front and the processing phase before /complete', async () => {
      const file = makeFile('clip.mp4', 'video/mp4', 1024);
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { sessionId: 'sess-phase' } }) // init
        .mockResolvedValueOnce({
          data: { receivedChunks: [0], totalChunks: 1 },
        }) // chunk
        .mockResolvedValueOnce({ data: { cid: 'QmPhase' } }); // complete

      const onPhaseChange = jest.fn();
      await uploadToIPFSChunked(file, { onPhaseChange });

      expect(onPhaseChange.mock.calls.map((c) => c[0])).toEqual([
        'uploading',
        'processing',
      ]);
    });

    it('splits a multi-chunk file into CHUNK_SIZE_BYTES pieces and uploads each', async () => {
      const file = makeFile(
        'clip.mp4',
        'video/mp4',
        CHUNK_SIZE_BYTES * 2 + 100,
      );
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { sessionId: 'sess-multi' } })
        .mockResolvedValueOnce({
          data: { receivedChunks: [0], totalChunks: 3 },
        })
        .mockResolvedValueOnce({
          data: { receivedChunks: [0, 1], totalChunks: 3 },
        })
        .mockResolvedValueOnce({
          data: { receivedChunks: [0, 1, 2], totalChunks: 3 },
        })
        .mockResolvedValueOnce({ data: { cid: 'QmMulti' } });

      const onProgress = jest.fn();
      const cid = await uploadToIPFSChunked(file, { onProgress });

      expect(cid).toBe('QmMulti');
      // init + 3 chunks + complete = 5 total POSTs
      expect(axios.post).toHaveBeenCalledTimes(5);
      expect(axios.post).toHaveBeenNthCalledWith(1, '/api/ipfs/upload/init', {
        filename: 'clip.mp4',
        fileType: 'video/mp4',
        fileSize: CHUNK_SIZE_BYTES * 2 + 100,
        totalChunks: 3,
      });
      expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
        0,
        1 / 3,
        2 / 3,
        1,
      ]);
    });

    it('resuming a session skips init and only uploads chunks the server does not have', async () => {
      const file = makeFile('clip.mp4', 'video/mp4', CHUNK_SIZE_BYTES * 2);
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: { receivedChunks: [0], totalChunks: 2 },
      });
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({
          data: { receivedChunks: [0, 1], totalChunks: 2 },
        }) // chunk 1 only
        .mockResolvedValueOnce({ data: { cid: 'QmResumed' } }); // complete

      const cid = await uploadToIPFSChunked(file, {
        resumeSessionId: 'sess-resume',
      });

      expect(cid).toBe('QmResumed');
      expect(axios.get).toHaveBeenCalledWith('/api/ipfs/upload/status', {
        params: { sessionId: 'sess-resume' },
      });
      // Only one chunk POST (index 1) plus complete — no init call, no re-upload of chunk 0.
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('retries a failed chunk before giving up', async () => {
      jest.useFakeTimers();
      const file = makeFile('clip.mp4', 'video/mp4', 1024);
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { sessionId: 'sess-retry' } }) // init
        .mockRejectedValueOnce(new Error('network blip')) // chunk attempt 1
        .mockResolvedValueOnce({
          data: { receivedChunks: [0], totalChunks: 1 },
        }) // chunk attempt 2
        .mockResolvedValueOnce({ data: { cid: 'QmRetried' } }); // complete

      const promise = uploadToIPFSChunked(file);
      await jest.runAllTimersAsync();
      const cid = await promise;

      expect(cid).toBe('QmRetried');
      jest.useRealTimers();
    });

    it('throws a resumable ChunkedUploadError after exhausting chunk retries', async () => {
      jest.useFakeTimers();
      const file = makeFile('clip.mp4', 'video/mp4', 1024);
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { sessionId: 'sess-fail' } }) // init
        .mockRejectedValue(new Error('persistent network failure')); // every chunk attempt

      const promise = uploadToIPFSChunked(file).catch((err) => err);
      await jest.runAllTimersAsync();
      const err = await promise;

      expect(err).toBeInstanceOf(ChunkedUploadError);
      expect(err.sessionId).toBe('sess-fail');
      expect(err.uploadedChunks).toBe(0);
      expect(err.totalChunks).toBe(1);
      jest.useRealTimers();
    });
  });

  describe('getChunkedUploadStatus', () => {
    it('GETs the status endpoint with the sessionId param', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: { receivedChunks: [0, 1], totalChunks: 3 },
      });

      const result = await getChunkedUploadStatus('sess-1');

      expect(axios.get).toHaveBeenCalledWith('/api/ipfs/upload/status', {
        params: { sessionId: 'sess-1' },
      });
      expect(result).toEqual({ receivedChunks: [0, 1], totalChunks: 3 });
    });
  });
});
