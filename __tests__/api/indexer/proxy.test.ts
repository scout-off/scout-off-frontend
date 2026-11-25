/** @jest-environment node */
/**
 * Tests that the Next.js indexer proxy blocks /metrics and allows /health.
 *
 * We test the route handler directly (not via a running HTTP server) by
 * constructing NextRequest objects and asserting on the NextResponse.
 */

import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/indexer/[...path]/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(path: string[]): NextRequest {
  const url = `http://localhost/api/indexer/${path.join('/')}`;
  return new NextRequest(url, { method: 'GET' });
}

// ── /metrics must be blocked ─────────────────────────────────────────────────

describe('proxy — /metrics is blocked', () => {
  test('GET /api/indexer/metrics returns 404', async () => {
    const req = makeRequest(['metrics']);
    const res = await GET(req, { params: { path: ['metrics'] } });
    expect(res.status).toBe(404);
  });

  test('blocked response body contains error key', async () => {
    const req = makeRequest(['metrics']);
    const res = await GET(req, { params: { path: ['metrics'] } });
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ── /health is forwarded ──────────────────────────────────────────────────────

describe('proxy — /health is forwarded', () => {
  beforeEach(() => {
    // Build a minimal fetch-response-shaped object — Response is not available
    // in a plain Node jest environment.
    const fakeResponse = {
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({ status: 'ok', lastLedger: 0, uptime: 1 }),
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    };
    global.fetch = jest.fn().mockResolvedValue(fakeResponse) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GET /api/indexer/health returns 200', async () => {
    const req = makeRequest(['health']);
    const res = await GET(req, { params: { path: ['health'] } });
    expect(res.status).toBe(200);
  });

  test('proxied response body contains status field', async () => {
    const req = makeRequest(['health']);
    const res = await GET(req, { params: { path: ['health'] } });
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});

// ── Upstream unavailable ──────────────────────────────────────────────────────

describe('proxy — upstream errors', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('ECONNREFUSED'),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 502 when indexer is unreachable', async () => {
    const req = makeRequest(['health']);
    const res = await GET(req, { params: { path: ['health'] } });
    expect(res.status).toBe(502);
  });
});
