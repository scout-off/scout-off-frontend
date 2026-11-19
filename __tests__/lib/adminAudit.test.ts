import {
  ADMIN_AUDIT_ACTION_LABELS,
  ADMIN_AUDIT_ACTION_TYPES,
  isAdminAuditActionType,
  type AdminAuditActionType,
  type ReconciliationMismatch,
  type ReconciliationResult,
  type ReconciliationRun,
} from '@/lib/adminAudit';

describe('ADMIN_AUDIT_ACTION_TYPES', () => {
  it('lists every supported action type', () => {
    expect(ADMIN_AUDIT_ACTION_TYPES).toEqual([
      'validator_add',
      'validator_remove',
      'fee_withdrawal',
      'pause',
      'unpause',
      'fraud_flag_dismiss',
      'media_approve',
      'media_deny',
      'media_reinstate',
    ]);
  });
});

describe('isAdminAuditActionType', () => {
  it.each(ADMIN_AUDIT_ACTION_TYPES)(
    'returns true for the known action type %s',
    (actionType) => {
      expect(isAdminAuditActionType(actionType)).toBe(true);
    },
  );

  it('returns false for unknown strings', () => {
    expect(isAdminAuditActionType('validator_add ')).toBe(false);
    expect(isAdminAuditActionType('unknown_action')).toBe(false);
    expect(isAdminAuditActionType('')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isAdminAuditActionType(undefined)).toBe(false);
    expect(isAdminAuditActionType(null)).toBe(false);
    expect(isAdminAuditActionType(42)).toBe(false);
    expect(isAdminAuditActionType({ actionType: 'pause' })).toBe(false);
    expect(isAdminAuditActionType(['pause'])).toBe(false);
  });

  it('narrows the type for known values', () => {
    const value: unknown = 'fee_withdrawal';
    if (isAdminAuditActionType(value)) {
      const narrowed: AdminAuditActionType = value;
      expect(narrowed).toBe('fee_withdrawal');
    } else {
      throw new Error('expected fee_withdrawal to be a valid action type');
    }
  });
});

describe('ADMIN_AUDIT_ACTION_LABELS', () => {
  it('has a human-readable label for every action type', () => {
    for (const actionType of ADMIN_AUDIT_ACTION_TYPES) {
      expect(ADMIN_AUDIT_ACTION_LABELS[actionType]).toEqual(expect.any(String));
      expect(ADMIN_AUDIT_ACTION_LABELS[actionType].length).toBeGreaterThan(0);
    }
  });

  it('maps representative action types to their labels', () => {
    expect(ADMIN_AUDIT_ACTION_LABELS.validator_add).toBe('Validator Added');
    expect(ADMIN_AUDIT_ACTION_LABELS.fee_withdrawal).toBe('Fees Withdrawn');
    expect(ADMIN_AUDIT_ACTION_LABELS.media_deny).toBe('Media Denylisted');
  });
});

describe('reconciliation shapes', () => {
  it('distinguishes missing_audit_entry from missing_onchain_effect', () => {
    const missingAuditEntry: ReconciliationMismatch = {
      actionType: 'validator_add',
      kind: 'missing_audit_entry',
      description: 'Validator present on-chain but no audit log record',
      target: 'GVALIDATORADDRESS',
    };
    const missingOnchainEffect: ReconciliationMismatch = {
      actionType: 'validator_remove',
      kind: 'missing_onchain_effect',
      description: 'Audit log recorded a removal not reflected on-chain',
      target: 'GVALIDATORADDRESS',
    };

    expect(missingAuditEntry.kind).toBe('missing_audit_entry');
    expect(missingOnchainEffect.kind).toBe('missing_onchain_effect');
    expect(missingAuditEntry.kind).not.toBe(missingOnchainEffect.kind);
  });

  it('allows a mismatch without a target', () => {
    const mismatch: ReconciliationMismatch = {
      actionType: 'pause',
      kind: 'missing_onchain_effect',
      description: 'Pause recorded in audit log but contract is not paused',
    };
    expect(mismatch.target).toBeUndefined();
  });

  it('carries mismatches and skipped sections on a reconciliation result', () => {
    const result: ReconciliationResult = {
      checkedAt: 1_700_000_000,
      mismatches: [
        {
          actionType: 'fee_withdrawal',
          kind: 'missing_audit_entry',
          description: 'Withdrawal observed on-chain without audit entry',
        },
      ],
      skipped: ['indexer'],
    };

    expect(result.checkedAt).toBe(1_700_000_000);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].kind).toBe('missing_audit_entry');
    expect(result.skipped).toEqual(['indexer']);
  });

  it('tracks new mismatch counts on a persisted reconciliation run', () => {
    const run: ReconciliationRun = {
      id: 7,
      checkedAt: 1_700_000_000,
      mismatches: [
        {
          actionType: 'media_approve',
          kind: 'missing_onchain_effect',
          description: 'Approval recorded but media not approved on-chain',
        },
      ],
      newMismatchCount: 1,
      skipped: [],
    };

    expect(run.id).toBe(7);
    expect(run.newMismatchCount).toBe(1);
    expect(run.mismatches[0].kind).toBe('missing_onchain_effect');
    expect(run.skipped).toEqual([]);
  });
});
