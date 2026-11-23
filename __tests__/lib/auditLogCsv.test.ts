import { buildAuditLogCsv } from '@/lib/auditLogCsv';
import type { AdminAuditEntry } from '@/lib/adminAudit';

function makeEntry(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    id: 1,
    actionType: 'validator_add',
    adminWallet: 'GADMIN',
    target: 'GVAL1',
    amountStroops: null,
    txHash: 'txhash1',
    status: 'submitted',
    timestamp: 1_700_000_000,
    data: {},
    ...overrides,
  };
}

describe('buildAuditLogCsv', () => {
  it('includes a header row', () => {
    const csv = buildAuditLogCsv([]);
    expect(csv).toBe(
      'timestamp,action,admin wallet,target,amount (XLM),tx hash,status\n',
    );
  });

  it('formats a validator_add entry as a row', () => {
    const csv = buildAuditLogCsv([makeEntry()]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      `${new Date(1_700_000_000 * 1000).toISOString()},Validator Added,GADMIN,GVAL1,,txhash1,submitted`,
    );
  });

  it('converts amountStroops to XLM for fee withdrawals', () => {
    const csv = buildAuditLogCsv([
      makeEntry({
        actionType: 'fee_withdrawal',
        target: null,
        amountStroops: 50_000_000,
      }),
    ]);
    expect(csv).toContain('5');
    expect(csv.trim().split('\n')[1]).toBe(
      `${new Date(1_700_000_000 * 1000).toISOString()},Fees Withdrawn,GADMIN,,5,txhash1,submitted`,
    );
  });

  it('renders empty strings for null target and txHash', () => {
    const csv = buildAuditLogCsv([
      makeEntry({ actionType: 'pause', target: null, txHash: null }),
    ]);
    expect(csv.trim().split('\n')[1]).toBe(
      `${new Date(1_700_000_000 * 1000).toISOString()},Contract Paused,GADMIN,,,,submitted`,
    );
  });

  it('escapes values containing commas or quotes', () => {
    const csv = buildAuditLogCsv([
      makeEntry({ data: {}, adminWallet: 'GADMIN,"weird"' }),
    ]);
    expect(csv).toContain('"GADMIN,""weird"""');
  });
});
