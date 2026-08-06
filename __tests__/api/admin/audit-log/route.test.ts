/** @jest-environment node */
import { GET, POST } from '@/app/api/admin/audit-log/route';
import { NextRequest } from 'next/server';
import { AdminAuditStore } from '@/lib/adminAuditStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';

function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) headers['cookie'] = `session=${init.cookie}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  AdminAuditStore.resetInstance();
  AdminAuditStore.getInstance(':memory:');
});

afterEach(() => {
  AdminAuditStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('GET /api/admin/audit-log', () => {
  it('returns 401 without a matching session cookie', async () => {
    const res = await GET(makeRequest('http://localhost/api/admin/audit-log'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-admin session cookie', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/admin/audit-log', {
        cookie: 'GSOMEONEELSE',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for an unknown actionType', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/admin/audit-log?actionType=bogus', {
        cookie: ADMIN,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns an empty list when nothing has been recorded', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/admin/audit-log', { cookie: ADMIN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [], nextCursor: null });
  });

  it('filters by actionType', async () => {
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'pause',
      adminWallet: ADMIN,
      status: 'submitted',
      timestamp: 1,
    });
    AdminAuditStore.getInstance().insertEntry({
      actionType: 'unpause',
      adminWallet: ADMIN,
      status: 'submitted',
      timestamp: 2,
    });

    const res = await GET(
      makeRequest('http://localhost/api/admin/audit-log?actionType=pause', {
        cookie: ADMIN,
      }),
    );
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].actionType).toBe('pause');
  });
});

describe('POST /api/admin/audit-log', () => {
  it('returns 401 without a matching session cookie', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/admin/audit-log', {
        method: 'POST',
        body: { actionType: 'pause', status: 'submitted' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for an unknown actionType', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/admin/audit-log', {
        method: 'POST',
        cookie: ADMIN,
        body: { actionType: 'delete_everything', status: 'submitted' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/admin/audit-log', {
        method: 'POST',
        cookie: ADMIN,
        body: { actionType: 'pause', status: 'in_progress' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('records a new entry and returns it with 201', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/admin/audit-log', {
        method: 'POST',
        cookie: ADMIN,
        body: {
          actionType: 'validator_add',
          target: 'GVAL1',
          txHash: 'abc123',
          status: 'submitted',
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      actionType: 'validator_add',
      adminWallet: ADMIN,
      target: 'GVAL1',
      txHash: 'abc123',
      status: 'submitted',
    });

    const { entries } = AdminAuditStore.getInstance().getEntries();
    expect(entries).toHaveLength(1);
  });

  it('sets the admin wallet from the session cookie, not the request body', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/admin/audit-log', {
        method: 'POST',
        cookie: ADMIN,
        body: {
          actionType: 'pause',
          status: 'submitted',
          adminWallet: 'GSPOOFED',
        },
      }),
    );
    const body = await res.json();
    expect(body.adminWallet).toBe(ADMIN);
  });
});
