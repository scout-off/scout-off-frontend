import { escapeCsvValue } from '@/lib/csvSafe';
import { buildAuditLogCsv } from '@/lib/auditLogCsv';
import { buildReferralCodesCsv } from '@/lib/referralCsv';
import { buildValidatorActionLogCsv } from '@/lib/validatorActionLogCsv';
import type { AdminAuditEntry } from '@/lib/adminAudit';
import type { ValidatorActionEntry } from '@/hooks/useValidatorActionLog';

const PAYLOADS: [string, string][] = [
  ['=1+1', "'=1+1"],
  ['+1+1', "'+1+1"],
  ['-1+1', "'-1+1"],
  ['@SUM(A1)', "'@SUM(A1)"],
  ['\t=1+1', "'\t=1+1"],
  ['\r=1+1', `"'\r=1+1"`],
];

describe('escapeCsvValue', () => {
  it.each(PAYLOADS)('neutralises %j', (input, expected) => {
    expect(escapeCsvValue(input)).toBe(expected);
  });

  it('leaves normal values unchanged', () => {
    expect(escapeCsvValue('GABC123')).toBe('GABC123');
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
    expect(escapeCsvValue('2024-01-01T00:00:00.000Z')).toBe(
      '2024-01-01T00:00:00.000Z',
    );
  });
});

describe('CSV builders neutralise formula payloads', () => {
  it.each(PAYLOADS)('auditLog target %j', (input, expected) => {
    const entry: AdminAuditEntry = {
      id: 1,
      actionType: 'validator_add',
      adminWallet: 'GADMIN',
      target: input,
      amountStroops: null,
      txHash: 'tx',
      status: 'submitted',
      timestamp: 1_700_000_000,
      data: {},
    };
    expect(buildAuditLogCsv([entry])).toContain(`,${expected},`);
  });

  it.each(PAYLOADS)('referral code %j', (input, expected) => {
    const csv = buildReferralCodesCsv(
      [
        {
          code: input,
          scoutWallet: 'GSCOUT',
          createdAt: 1_700_000_000_000,
          usedBy: null,
          usedAt: null,
        },
      ],
      'https://example.com',
    );
    expect(csv.split('\n')[1].startsWith(`${expected},`)).toBe(true);
  });

  it.each(PAYLOADS)('validator log player %j', (input, expected) => {
    const entry = {
      id: 'approved-1',
      timestamp: 1_700_000_000,
      validator: 'GVAL',
      playerId: input,
      milestoneId: 'm1',
      action: 'approved',
    } as ValidatorActionEntry;
    expect(buildValidatorActionLogCsv([entry])).toContain(`,${expected},`);
  });
});
