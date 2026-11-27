/** @jest-environment node */
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

jest.mock('@/lib/adminAuth', () => ({
  requireAdminWallet: jest.fn(),
}));

const mockStore = {
  insertEntry: jest.fn(),
  getEntries: jest.fn().mockReturnValue({ entries: [], nextCursor: null }),
};
jest.mock('@/lib/adminAuditStore', () => ({
  AdminAuditStore: { getInstance: () => mockStore },
}));

import { requireAdminWallet } from '@/lib/adminAuth';
import { GET, POST } from '@/app/api/admin/automated-moderation-log/route';

const SECRET = 'test-secret';

function makePost(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(
    'http://localhost/api/admin/automated-moderation-log',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  );
}

function sign(rawBody: string, timestamp: number) {
  return createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

const validBody = {
  id: 'mod-1',
  category: 'auto_flag',
  userId: 'user-1',
  threadId: 'thread-1',
  rule: 'spam',
  severity: 'high',
  timestamp: Date.now(),
  context: { reason: 'test' },
};

describe('automated-moderation-log POST', () => {
  const originalSecret = process.env.MODERATION_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.MODERATION_WEBHOOK_SECRET = originalSecret;
    jest.clearAllMocks();
  });

  it('returns 503 when secret is unset', async () => {
    delete process.env.MODERATION_WEBHOOK_SECRET;
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(503);
  });

  it('returns 401 without credentials', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid signature', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const res = await POST(
      makePost(validBody, {
        'x-signature': 'bad',
        'x-signature-timestamp': String(Date.now()),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts a valid HMAC signature', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const ts = Date.now();
    const raw = JSON.stringify(validBody);
    const res = await POST(
      makePost(validBody, {
        'x-signature': sign(raw, ts),
        'x-signature-timestamp': String(ts),
      }),
    );
    expect(res.status).toBe(201);
    expect(mockStore.insertEntry).toHaveBeenCalled();
  });

  it('accepts a valid Bearer token', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const res = await POST(
      makePost(validBody, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(201);
  });

  it('rejects invalid severity', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const res = await POST(
      makePost(
        { ...validBody, severity: 'nope' },
        { authorization: `Bearer ${SECRET}` },
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric timestamp', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const res = await POST(
      makePost(
        { ...validBody, timestamp: 'yesterday' },
        { authorization: `Bearer ${SECRET}` },
      ),
    );
    expect(res.status).toBe(400);
  });

  it('returns 413 for oversized context', async () => {
    process.env.MODERATION_WEBHOOK_SECRET = SECRET;
    const res = await POST(
      makePost(
        { ...validBody, context: { blob: 'x'.repeat(5000) } },
        { authorization: `Bearer ${SECRET}` },
      ),
    );
    expect(res.status).toBe(413);
  });
});

describe('automated-moderation-log GET', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 401 when not authorized', async () => {
    (requireAdminWallet as jest.Mock).mockReturnValue(null);
    const res = await GET(
      new NextRequest('http://localhost/api/admin/automated-moderation-log'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-numeric limit', async () => {
    (requireAdminWallet as jest.Mock).mockReturnValue('GADMIN');
    const res = await GET(
      new NextRequest(
        'http://localhost/api/admin/automated-moderation-log?limit=abc',
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a limit above the maximum', async () => {
    (requireAdminWallet as jest.Mock).mockReturnValue('GADMIN');
    const res = await GET(
      new NextRequest(
        'http://localhost/api/admin/automated-moderation-log?limit=9999',
      ),
    );
    expect(res.status).toBe(400);
  });

  it('returns entries for an admin', async () => {
    (requireAdminWallet as jest.Mock).mockReturnValue('GADMIN');
    const res = await GET(
      new NextRequest(
        'http://localhost/api/admin/automated-moderation-log?limit=20',
      ),
    );
    expect(res.status).toBe(200);
    expect(mockStore.getEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'automated_moderation',
        limit: 20,
      }),
    );
  });
});
