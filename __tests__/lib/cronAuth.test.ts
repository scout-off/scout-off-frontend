/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import * as crypto from 'crypto';

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

import { verifyCronRequest } from '@/lib/cronAuth';

const SECRET = 'test-cron-secret';

function makeReq(authorization?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/cron/prune-data', { headers });
}

describe('verifyCronRequest', () => {
  const ORIGINAL = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    (crypto.timingSafeEqual as jest.Mock).mockClear();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL;
  });

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronRequest(makeReq(`Bearer ${SECRET}`));
    expect(res?.status).toBe(500);
    await expect(res?.json()).resolves.toEqual({
      error: 'CRON_SECRET is not configured',
    });
  });

  it('returns 403 when the authorization header is missing', async () => {
    const res = verifyCronRequest(makeReq());
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it.each([
    ['wrong secret of the same length', `Bearer ${'x'.repeat(SECRET.length)}`],
    ['right secret without the Bearer prefix', SECRET],
    ['different-length value', `Bearer ${SECRET}-extra`],
    // The scheme comparison is intentionally case-sensitive: only the exact
    // `Bearer <secret>` string sent by the scheduler is accepted.
    ['lowercase bearer scheme', `bearer ${SECRET}`],
  ])('returns 403 for %s', (_label, header) => {
    expect(verifyCronRequest(makeReq(header))?.status).toBe(403);
  });

  it('returns null for a correct Bearer secret', () => {
    expect(verifyCronRequest(makeReq(`Bearer ${SECRET}`))).toBeNull();
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it('does not call timingSafeEqual with different-length buffers', () => {
    expect(() => verifyCronRequest(makeReq('Bearer short'))).not.toThrow();
    expect(crypto.timingSafeEqual).not.toHaveBeenCalled();
  });
});
