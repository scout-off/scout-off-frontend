/** @jest-environment node */
import axios from 'axios';
import {
  pinJson,
  clearPinJsonCache,
  getPinJsonCacheSize,
  hashMetadata,
  getCacheTtlMs,
} from '@/lib/pinJson';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const MOCK_CID_1 = 'QmPinJsonCid1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const MOCK_CID_2 = 'QmPinJsonCid2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

function makePinataResponse(cid: string) {
  return { data: { IpfsHash: cid } };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPinJsonCache();
  process.env.PINATA_API_KEY = 'test-key';
  process.env.PINATA_SECRET = 'test-secret';
  delete process.env.PINJSON_CACHE_TTL_MS;
});

afterEach(() => {
  clearPinJsonCache();
  delete process.env.PINATA_API_KEY;
  delete process.env.PINATA_SECRET;
  delete process.env.PINJSON_CACHE_TTL_MS;
});

describe('pinJson deduplication cache', () => {
  it('calls Pinata once for the first submission', async () => {
    mockedAxios.post.mockResolvedValue(makePinataResponse(MOCK_CID_1));

    const cid = await pinJson({ wallet: 'GABC', name: 'Alice' });

    expect(cid).toBe(MOCK_CID_1);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('returns the cached CID without a second Pinata call for identical metadata within TTL', async () => {
    mockedAxios.post.mockResolvedValue(makePinataResponse(MOCK_CID_1));

    const metadata = { wallet: 'GABC', name: 'Alice' };
    const cid1 = await pinJson(metadata);
    const cid2 = await pinJson(metadata);

    expect(cid1).toBe(MOCK_CID_1);
    expect(cid2).toBe(MOCK_CID_1);
    // Pinata should only have been called ONCE despite two submissions
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('calls Pinata again for different metadata', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(makePinataResponse(MOCK_CID_1))
      .mockResolvedValueOnce(makePinataResponse(MOCK_CID_2));

    const cid1 = await pinJson({ wallet: 'GABC', name: 'Alice' });
    const cid2 = await pinJson({ wallet: 'GXYZ', name: 'Bob' });

    expect(cid1).toBe(MOCK_CID_1);
    expect(cid2).toBe(MOCK_CID_2);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('pins again after the TTL has expired', async () => {
    // Set a very short TTL (1 ms) so we can expire it trivially
    process.env.PINJSON_CACHE_TTL_MS = '1';

    mockedAxios.post
      .mockResolvedValueOnce(makePinataResponse(MOCK_CID_1))
      .mockResolvedValueOnce(makePinataResponse(MOCK_CID_2));

    const metadata = { wallet: 'GABC', name: 'Alice' };
    const cid1 = await pinJson(metadata);

    // Wait for the TTL to expire
    await new Promise((r) => setTimeout(r, 10));

    const cid2 = await pinJson(metadata);

    // Both should have triggered Pinata (2 calls)
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    // The second call gets a fresh CID (simulating a different pin run)
    expect(cid1).toBe(MOCK_CID_1);
    expect(cid2).toBe(MOCK_CID_2);
  });

  it('key-order-independent: same fields in different order produce the same CID', async () => {
    mockedAxios.post.mockResolvedValue(makePinataResponse(MOCK_CID_1));

    const cid1 = await pinJson({ wallet: 'GABC', level: 2 });
    const cid2 = await pinJson({ level: 2, wallet: 'GABC' }); // different key order

    expect(cid1).toBe(MOCK_CID_1);
    expect(cid2).toBe(MOCK_CID_1);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('propagates Pinata errors without corrupting the cache', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('Pinata unavailable'))
      .mockResolvedValueOnce(makePinataResponse(MOCK_CID_1));

    const metadata = { wallet: 'GERR' };

    await expect(pinJson(metadata)).rejects.toThrow('Pinata unavailable');
    // Cache should be empty after a failed pin
    expect(getPinJsonCacheSize()).toBe(0);

    // Retrying should succeed and populate the cache
    const cid = await pinJson(metadata);
    expect(cid).toBe(MOCK_CID_1);
    expect(getPinJsonCacheSize()).toBe(1);
  });

  it('sends pinataContent and optional name tag to Pinata', async () => {
    mockedAxios.post.mockResolvedValue(makePinataResponse(MOCK_CID_1));

    const metadata = { wallet: 'GABC' };
    await pinJson(metadata, { name: 'Alice Profile' });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        pinataContent: metadata,
        pinataMetadata: { name: 'Alice Profile' },
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          pinata_api_key: 'test-key',
          pinata_secret_api_key: 'test-secret',
        }),
      }),
    );
  });

  it('omits pinataMetadata when no name option is provided', async () => {
    mockedAxios.post.mockResolvedValue(makePinataResponse(MOCK_CID_1));

    await pinJson({ wallet: 'GABC' });

    const callArg = mockedAxios.post.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(callArg).not.toHaveProperty('pinataMetadata');
  });
});

describe('getCacheTtlMs', () => {
  it('defaults to 5 minutes when PINJSON_CACHE_TTL_MS is not set', () => {
    delete process.env.PINJSON_CACHE_TTL_MS;
    expect(getCacheTtlMs()).toBe(5 * 60 * 1000);
  });

  it('reads the TTL from PINJSON_CACHE_TTL_MS env var', () => {
    process.env.PINJSON_CACHE_TTL_MS = '30000';
    expect(getCacheTtlMs()).toBe(30_000);
  });

  it('falls back to default when PINJSON_CACHE_TTL_MS is not a valid number', () => {
    process.env.PINJSON_CACHE_TTL_MS = 'banana';
    expect(getCacheTtlMs()).toBe(5 * 60 * 1000);
  });
});

describe('hashMetadata', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const h = hashMetadata({ wallet: 'GABC' });
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[a-f0-9]+$/);
  });

  it('produces the same hash for equivalent objects regardless of key order', () => {
    const h1 = hashMetadata({ a: 1, b: 2 });
    const h2 = hashMetadata({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different values', () => {
    const h1 = hashMetadata({ wallet: 'GABC' });
    const h2 = hashMetadata({ wallet: 'GXYZ' });
    expect(h1).not.toBe(h2);
  });
});
