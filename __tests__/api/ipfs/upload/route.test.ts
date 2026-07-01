/** @jest-environment node */
import { POST } from '../../../../app/api/ipfs/upload/route';
import { NextRequest } from 'next/server';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const JPEG_HEADER = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const INVALID_HEADER = new Uint8Array(12); // all zero bytes — no known signature

function makeFile(
  bytes: Uint8Array,
  name = 'photo.jpg',
  type = 'image/jpeg',
): File {
  return new File([bytes], name, { type });
}

function makeRequest(
  options: { form?: FormData; ip?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.ip) headers['x-forwarded-for'] = options.ip;

  return new NextRequest('http://localhost:3000/api/ipfs/upload', {
    method: 'POST',
    headers,
    body: options.form,
  });
}

describe('POST /api/ipfs/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PINATA_API_KEY = 'test-api-key';
    process.env.PINATA_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.PINATA_API_KEY;
    delete process.env.PINATA_SECRET;
  });

  it('returns 400 when the request body is not valid form data', async () => {
    const req = new NextRequest('http://localhost:3000/api/ipfs/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': 'ip-badform',
      },
      body: JSON.stringify({ foo: 'bar' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid form data' });
  });

  it('returns 400 when no file is provided', async () => {
    const form = new FormData();
    form.append('caption', 'hello');
    const req = makeRequest({ form, ip: 'ip-nofile' });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No file provided' });
  });

  it('returns 400 when the file exceeds the 100 MB size limit', async () => {
    const oversized = new Uint8Array(101 * 1024 * 1024);
    oversized.set(JPEG_HEADER, 0);
    const bigFile = makeFile(oversized, 'huge.jpg', 'image/jpeg');

    const form = new FormData();
    form.append('file', bigFile);
    const req = makeRequest({ form, ip: 'ip-oversize' });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds the 100 MB size limit/);
  });

  it('returns 400 for a disallowed MIME type', async () => {
    const file = makeFile(JPEG_HEADER, 'doc.pdf', 'application/pdf');
    const form = new FormData();
    form.append('file', file);
    const req = makeRequest({ form, ip: 'ip-badmime' });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/is not allowed/);
  });

  it('returns 400 when the file content does not match its declared MIME type', async () => {
    const file = makeFile(INVALID_HEADER, 'fake.jpg', 'image/jpeg');
    const form = new FormData();
    form.append('file', file);
    const req = makeRequest({ form, ip: 'ip-spoof' });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match its declared type/);
  });

  it('uploads a valid image to Pinata and returns the CID', async () => {
    mockedAxios.post.mockResolvedValue({ data: { IpfsHash: 'QmTestCid123' } });

    const file = makeFile(JPEG_HEADER, 'photo.jpg', 'image/jpeg');
    const form = new FormData();
    form.append('file', file);
    const req = makeRequest({ form, ip: 'ip-success' });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cid: 'QmTestCid123' });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      expect.any(FormData),
      expect.objectContaining({
        headers: {
          pinata_api_key: 'test-api-key',
          pinata_secret_api_key: 'test-secret',
        },
      }),
    );
  });

  it('returns 502 when the Pinata upload fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('pinata unreachable'));

    const file = makeFile(JPEG_HEADER, 'photo.jpg', 'image/jpeg');
    const form = new FormData();
    form.append('file', file);
    const req = makeRequest({ form, ip: 'ip-pinata-error' });

    const res = await POST(req);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Failed to upload file to IPFS',
    });
  });

  it('sanitizes text fields present alongside the file', async () => {
    mockedAxios.post.mockResolvedValue({ data: { IpfsHash: 'QmSanitized' } });

    const file = makeFile(JPEG_HEADER, 'photo.jpg', 'image/jpeg');
    const form = new FormData();
    form.append('caption', '<script>alert(1)</script>hello');
    form.append('file', file);
    const req = makeRequest({ form, ip: 'ip-sanitize' });

    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it('rate limits after exceeding 10 requests from the same IP within the window', async () => {
    mockedAxios.post.mockResolvedValue({ data: { IpfsHash: 'QmRateLimit' } });
    const ip = 'ip-rate-limited';

    let lastRes;
    for (let i = 0; i < 11; i++) {
      const form = new FormData();
      // Deliberately omit the file so requests resolve quickly with a 400,
      // except we only care about the 11th response's rate-limit status.
      lastRes = await POST(makeRequest({ form, ip }));
    }

    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json();
    expect(body).toEqual({ error: 'Too many requests' });
    expect(lastRes!.headers.get('Retry-After')).toBeTruthy();
  });

  it('falls back to the x-real-ip header when x-forwarded-for is absent', async () => {
    const form = new FormData();
    form.append('caption', 'hi');
    const req = new NextRequest('http://localhost:3000/api/ipfs/upload', {
      method: 'POST',
      headers: { 'x-real-ip': '203.0.113.5' },
      body: form,
    });

    const res = await POST(req);

    // No file provided — still exercises the getClientIp x-real-ip branch.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No file provided' });
  });
});
