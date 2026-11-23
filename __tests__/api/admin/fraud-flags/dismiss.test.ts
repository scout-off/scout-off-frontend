/** @jest-environment node */
import { POST } from '@/app/api/admin/fraud-flags/dismiss/route';
import { NextRequest } from 'next/server';
import { FraudFlagDismissalStore } from '@/lib/fraudFlagDismissalStore';
import { AdminAuditStore } from '@/lib/adminAuditStore';
import { computeFraudFlagDismissalKey } from '@/lib/fraudDetection';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const OTHER = 'GOTHER0000000000000000000000000000000000000000000000000';

const FLAG = {
  category: 'referral' as const,
  heuristic: 'self_referral',
  severity: 'high' as const,
  wallets: ['GSOMEONE'],
  reason: 'test reason',
};

function makeRequest(body: unknown, wallet?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (wallet !== undefined) {
    const sid = `sid-${Math.random()}`;
    SessionStore.getInstance().create(sid, wallet, Date.now() + 60_000);
    headers['cookie'] =
      `session=${createSessionToken(wallet, 'access', 20 * 60, { sid })}`;
  }
  return new NextRequest('http://localhost/api/admin/fraud-flags/dismiss', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  FraudFlagDismissalStore.resetInstance();
  AdminAuditStore.resetInstance();
});

afterAll(() => {
  FraudFlagDismissalStore.resetInstance();
  AdminAuditStore.resetInstance();
});

describe('POST /api/admin/fraud-flags/dismiss', () => {
  it('rejects unauthenticated callers', async () => {
    const res = await POST(makeRequest({ flag: FLAG }));
    expect(res.status).toBe(403);
  });

  it('rejects non-admin callers', async () => {
    const res = await POST(makeRequest({ flag: FLAG }, OTHER));
    expect(res.status).toBe(403);
    expect(FraudFlagDismissalStore.getInstance().listAll()).toHaveLength(0);
  });

  it('persists and returns a valid dismissal and writes an audit entry', async () => {
    const res = await POST(makeRequest({ flag: FLAG, note: 'known' }, ADMIN));
    expect(res.status).toBe(201);
    const key = computeFraudFlagDismissalKey(FLAG);
    const body = await res.json();
    expect(body).toMatchObject({
      flagKey: key,
      heuristic: FLAG.heuristic,
      dismissedBy: ADMIN,
      note: 'known',
    });
    expect(FraudFlagDismissalStore.getInstance().isDismissed(key)).toBe(true);

    const audit = AdminAuditStore.getInstance().getAllByActionTypeOldestFirst([
      'fraud_flag_dismiss',
    ]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ adminWallet: ADMIN, target: key });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await POST(makeRequest('not json', ADMIN));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an incomplete or unknown flag', async () => {
    const res = await POST(
      makeRequest({ flag: { ...FLAG, category: 'unknown' } }, ADMIN),
    );
    expect(res.status).toBe(400);
    const missing = await POST(makeRequest({}, ADMIN));
    expect(missing.status).toBe(400);
  });

  it('returns 400 for a non-string note', async () => {
    const res = await POST(makeRequest({ flag: FLAG, note: 42 }, ADMIN));
    expect(res.status).toBe(400);
  });

  it('is idempotent when dismissing the same flag twice', async () => {
    expect((await POST(makeRequest({ flag: FLAG }, ADMIN))).status).toBe(201);
    expect((await POST(makeRequest({ flag: FLAG }, ADMIN))).status).toBe(201);
    expect(FraudFlagDismissalStore.getInstance().listAll()).toHaveLength(1);
  });
});
