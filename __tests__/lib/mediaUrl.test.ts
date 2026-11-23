import { getMediaProxyUrl } from '@/lib/mediaUrl';

describe('getMediaProxyUrl', () => {
  test('builds a same-origin proxy path for a CID', () => {
    expect(getMediaProxyUrl('QmAbc123')).toBe('/api/media/QmAbc123');
  });

  test('URL-encodes special characters in the CID', () => {
    expect(getMediaProxyUrl('Qm Abc/123')).toBe('/api/media/Qm%20Abc%2F123');
  });

  // Edge case 1: empty CID
  // getMediaProxyUrl does not validate its input — it returns the proxy path
  // as-is. The API route handler (app/api/media/[cid]/route.ts) is responsible
  // for rejecting missing/empty CIDs with a 400. Components should avoid
  // calling this with an empty string, but the helper itself must not throw.
  test('returns a proxy path for an empty CID without throwing', () => {
    expect(() => getMediaProxyUrl('')).not.toThrow();
    expect(getMediaProxyUrl('')).toBe('/api/media/');
  });

  // Edge case 2: CID that is already a full https:// URL
  // Some callers may receive a pre-formed gateway URL instead of a bare CID
  // (e.g. data migrated before the proxy layer was introduced). The proxy
  // URL-encodes the full URL so it travels safely as a path segment; the API
  // route then decodes and fetches it. This verifies the helper is safe to
  // call with such input and does not double-proxy or strip the prefix.
  test('URL-encodes a full https:// URL passed as the CID argument', () => {
    const fullUrl = 'https://gateway.pinata.cloud/ipfs/QmAbc123';
    const encoded = encodeURIComponent(fullUrl);
    expect(getMediaProxyUrl(fullUrl)).toBe(`/api/media/${encoded}`);
  });

  // Edge case 3: NEXT_PUBLIC_IPFS_GATEWAY env var is unset
  // getMediaProxyUrl intentionally does NOT read NEXT_PUBLIC_IPFS_GATEWAY —
  // it always returns a same-origin /api/media/<cid> path. Verifying this
  // ensures the function's contract is stable regardless of the environment.
  test('returns the same proxy path whether NEXT_PUBLIC_IPFS_GATEWAY is set or unset', () => {
    const original = process.env.NEXT_PUBLIC_IPFS_GATEWAY;

    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY;
    const withoutGateway = getMediaProxyUrl('QmAbc123');

    process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';
    const withGateway = getMediaProxyUrl('QmAbc123');

    // Restore original value
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_IPFS_GATEWAY;
    } else {
      process.env.NEXT_PUBLIC_IPFS_GATEWAY = original;
    }

    expect(withoutGateway).toBe('/api/media/QmAbc123');
    expect(withGateway).toBe('/api/media/QmAbc123');
    expect(withoutGateway).toBe(withGateway);
  });

  test('appends a retry query param for client playback recovery', () => {
    expect(getMediaProxyUrl('QmClip.mp4', { retry: 2 })).toBe(
      '/api/media/QmClip.mp4?retry=2',
    );
    expect(getMediaProxyUrl('QmClip.mp4', { retry: 0 })).toBe(
      '/api/media/QmClip.mp4',
    );
  });
});
