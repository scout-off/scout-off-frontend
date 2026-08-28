/** @jest-environment node */
import { notifyNewMismatches } from '@/lib/reconciliationNotify';
import type { ReconciliationMismatch } from '@/lib/adminAudit';

const mismatch: ReconciliationMismatch = {
  actionType: 'validator_add',
  kind: 'missing_audit_entry',
  description: 'test mismatch',
  target: 'GABC',
};

describe('notifyNewMismatches', () => {
  const originalUrl = process.env.RECONCILIATION_WEBHOOK_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    process.env.RECONCILIATION_WEBHOOK_URL = originalUrl;
    jest.restoreAllMocks();
  });

  it('does nothing when no webhook URL is configured', async () => {
    delete process.env.RECONCILIATION_WEBHOOK_URL;
    await notifyNewMismatches({
      checkedAt: 1,
      newMismatches: [mismatch],
      totalMismatches: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when there are no new mismatches, even with a URL configured', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    await notifyNewMismatches({
      checkedAt: 1,
      newMismatches: [],
      totalMismatches: 3,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a JSON payload to the configured webhook when there are new mismatches', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    await notifyNewMismatches({
      checkedAt: 1_700_000_000,
      newMismatches: [mismatch],
      totalMismatches: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.newMismatches).toEqual([mismatch]);
    expect(body.totalMismatches).toBe(2);
    expect(body.checkedAt).toBe(1_700_000_000);
  });

  it('swallows a webhook delivery failure without throwing', async () => {
    process.env.RECONCILIATION_WEBHOOK_URL = 'https://example.com/webhook';
    fetchMock.mockRejectedValue(new Error('network error'));

    await expect(
      notifyNewMismatches({
        checkedAt: 1,
        newMismatches: [mismatch],
        totalMismatches: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
