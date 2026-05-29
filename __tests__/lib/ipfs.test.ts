import { ipfsUrl, uploadToIPFS, DEFAULT_IPFS_FALLBACKS } from '../../lib/ipfs';

describe('lib/ipfs', () => {
  const mockCid = 'QmTest123';
  const mockPrimaryGateway = 'https://gateway.pinata.cloud/ipfs';
  const mockFallback1 = 'https://ipfs.io/ipfs';
  const mockFallback2 = 'https://cloudflare-ipfs.com/ipfs';

  beforeEach(() => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = mockPrimaryGateway;
    global.fetch = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY;
  });

  describe('ipfsUrl', () => {
    it('returns primary gateway URL when primary is successful', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
      
      const result = await ipfsUrl(mockCid);
      
      expect(result).toBe(`${mockPrimaryGateway}/${mockCid}`);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to secondary gateway when primary returns 500', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true });
      
      const result = await ipfsUrl(mockCid);
      
      expect(result).toBe(`${mockFallback1}/${mockCid}`);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalled();
    });

    it('tries all gateways and throws error when all are exhausted', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 });
      
      await expect(ipfsUrl(mockCid)).rejects.toThrow('All IPFS gateways exhausted');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('uploadToIPFS', () => {
    it('posts to /api/ipfs/upload and returns the CID', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const mockCidResponse = { cid: 'QmUpload123' };
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCidResponse,
      });
      
      const result = await uploadToIPFS(mockFile);
      
      expect(result).toBe(mockCidResponse.cid);
      expect(global.fetch).toHaveBeenCalledWith('/api/ipfs/upload', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }));
    });
  });
});
