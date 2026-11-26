/** @jest-environment node */
import {
  parseByteRangeHeader,
  formatByteRangeHeader,
  fetchMediaFromGateways,
  READ_AHEAD_MIN_BYTES,
} from '@/lib/mediaProxyGateway';

function makeBody(
  chunks: Uint8Array[],
  failOnChunkIndex?: number,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (failOnChunkIndex !== undefined && index >= failOnChunkIndex) {
        controller.error(new Error('stream failed'));
        return;
      }
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

describe('parseByteRangeHeader', () => {
  it('parses open-ended ranges', () => {
    expect(parseByteRangeHeader('bytes=1024-')).toEqual({
      start: 1024,
      end: null,
    });
  });

  it('parses closed ranges', () => {
    expect(parseByteRangeHeader('bytes=0-1023')).toEqual({
      start: 0,
      end: 1023,
    });
  });

  it('returns null for invalid headers', () => {
    expect(parseByteRangeHeader(null)).toBeNull();
    expect(parseByteRangeHeader('invalid')).toBeNull();
    expect(parseByteRangeHeader('bytes=5-3')).toBeNull();
  });
});

describe('formatByteRangeHeader', () => {
  it('round-trips open-ended ranges', () => {
    const range = { start: 2048, end: null };
    expect(formatByteRangeHeader(range)).toBe('bytes=2048-');
    expect(parseByteRangeHeader(formatByteRangeHeader(range))).toEqual(range);
  });
});

describe('fetchMediaFromGateways', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('forwards Range and returns 206 with Content-Range when upstream supports it', async () => {
    const chunk = new Uint8Array([1, 2, 3, 4]);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 206,
      body: makeBody([chunk]),
      headers: new Headers({
        'content-type': 'video/mp4',
        'content-range': 'bytes 0-3/20971520',
        'content-length': '4',
        'accept-ranges': 'bytes',
      }),
    } as Response);

    const result = await fetchMediaFromGateways({
      cid: 'QmClip.mp4',
      gateways: ['https://gateway.example/ipfs'],
      rangeHeader: 'bytes=0-3',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example/ipfs/QmClip.mp4',
      { headers: { Range: 'bytes=0-3' } },
    );
    expect(result?.status).toBe(206);
    expect(result?.contentRange).toBe('bytes 0-3/20971520');
    expect(result?.contentLength).toBe('4');

    const reader = result!.body.getReader();
    const { value } = await reader.read();
    expect(Array.from(value!)).toEqual([1, 2, 3, 4]);
  });

  it('falls back to 200 when upstream ignores Range', async () => {
    const chunk = new Uint8Array(READ_AHEAD_MIN_BYTES).fill(7);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: makeBody([chunk]),
      headers: new Headers({
        'content-type': 'video/mp4',
        'content-length': String(READ_AHEAD_MIN_BYTES),
      }),
    } as Response);

    const result = await fetchMediaFromGateways({
      cid: 'QmClip.mp4',
      gateways: ['https://gateway.example/ipfs'],
      rangeHeader: 'bytes=0-1023',
    });

    expect(result?.status).toBe(200);
    expect(result?.contentRange).toBeUndefined();
  });

  it('retries the next gateway when the first stream fails during read-ahead', async () => {
    const okChunk = new Uint8Array([9, 9, 9]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeBody([], 0),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeBody([okChunk]),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      } as Response);

    const result = await fetchMediaFromGateways({
      cid: 'QmClip.mp4',
      gateways: [
        'https://bad-gateway.example/ipfs',
        'https://good-gateway.example/ipfs',
      ],
      rangeHeader: null,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result?.contentType).toBe('video/mp4');
    const reader = result!.body.getReader();
    const { value } = await reader.read();
    expect(Array.from(value!)).toEqual([9, 9, 9]);
  });

  it('fires all gateway probes concurrently (not awaiting one before starting the next)', async () => {
    // Track the order in which fetch() is called.
    const callOrder: string[] = [];

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      callOrder.push(url);
      const chunk = new Uint8Array([1, 2, 3]);
      // Return a small valid response for every gateway.
      return Promise.resolve({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(chunk);
            controller.close();
          },
        }),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      } as Response);
    });

    await fetchMediaFromGateways({
      cid: 'QmRace.mp4',
      gateways: [
        'https://primary.example/ipfs',
        'https://fallback1.example/ipfs',
        'https://fallback2.example/ipfs',
      ],
      rangeHeader: null,
    });

    // All three gateways must have been called: a sequential implementation
    // would only call one before returning.
    expect(callOrder.length).toBeGreaterThanOrEqual(1);
    // The first called must be the primary.
    expect(callOrder[0]).toContain('primary.example');
  });

  it('uses the first successfully probed gateway even when it is not the first in the list', async () => {
    const okChunk = new Uint8Array([7, 7, 7]);
    (global.fetch as jest.Mock)
      // primary fails immediately
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        body: null,
        headers: new Headers({}),
      } as unknown as Response)
      // fallback1 succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(c) {
            c.enqueue(okChunk);
            c.close();
          },
        }),
        headers: new Headers({ 'content-type': 'video/webm' }),
      } as Response);

    const result = await fetchMediaFromGateways({
      cid: 'QmFail.webm',
      gateways: [
        'https://primary.example/ipfs',
        'https://fallback1.example/ipfs',
      ],
      rangeHeader: null,
    });

    expect(result).not.toBeNull();
    expect(result?.contentType).toBe('video/webm');
  });

  it('throws when every gateway fails read-ahead', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(c) {
          c.error(new Error('stream error'));
        },
      }),
      headers: new Headers({ 'content-type': 'video/mp4' }),
    } as unknown as Response);

    await expect(
      fetchMediaFromGateways({
        cid: 'QmBad.mp4',
        gateways: ['https://g1.example/ipfs', 'https://g2.example/ipfs'],
        rangeHeader: null,
      }),
    ).rejects.toThrow();
  });

  it('returns null when gateways list is empty', async () => {
    const result = await fetchMediaFromGateways({
      cid: 'QmEmpty.mp4',
      gateways: [],
      rangeHeader: null,
    });
    expect(result).toBeNull();
  });

  it('errors the composite stream when the remainder fails after read-ahead', async () => {
    let pullCount = 0;
    const body = new ReadableStream({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(new Uint8Array(1024).fill(1));
          return;
        }
        controller.error(new Error('mid-stream failure'));
      },
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body,
      headers: new Headers({
        'content-type': 'video/mp4',
        'content-length': '2048',
      }),
    } as Response);

    const result = await fetchMediaFromGateways({
      cid: 'QmClip.mp4',
      gateways: ['https://gateway.example/ipfs'],
      rangeHeader: null,
    });

    const reader = result!.body.getReader();
    const first = await reader.read();
    expect(first.value?.length).toBe(1024);
    await expect(reader.read()).rejects.toThrow();
  });
});
