/**
 * Unit tests for lib/contractErrorMessage.ts
 *
 * Covers:
 * - All 12 CONTRACT_ERROR_KEYS having a non-empty message in CONTRACT_ERROR_MESSAGES
 * - extractContractErrorKey — named match, numeric code match, no match
 * - parseContractError — full resolution chain including fallback behaviour
 */

import {
  CONTRACT_ERROR_KEYS,
  CONTRACT_ERROR_MESSAGES,
  extractContractErrorKey,
  parseContractError,
  type ContractErrorKey,
} from '@/lib/contractErrorMessage';

describe('CONTRACT_ERROR_MESSAGES', () => {
  it('has an entry for every key in CONTRACT_ERROR_KEYS', () => {
    for (const key of CONTRACT_ERROR_KEYS) {
      expect(CONTRACT_ERROR_MESSAGES).toHaveProperty(key);
    }
  });

  it('every message is a non-empty string', () => {
    for (const key of CONTRACT_ERROR_KEYS) {
      const msg = CONTRACT_ERROR_MESSAGES[key as ContractErrorKey];
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('contains all 12 expected keys', () => {
    expect(CONTRACT_ERROR_KEYS).toHaveLength(12);
    expect(CONTRACT_ERROR_KEYS).toContain('AlreadyInitialized');
    expect(CONTRACT_ERROR_KEYS).toContain('NotInitialized');
    expect(CONTRACT_ERROR_KEYS).toContain('PlayerNotFound');
    expect(CONTRACT_ERROR_KEYS).toContain('UnauthorizedValidator');
    expect(CONTRACT_ERROR_KEYS).toContain('InvalidMilestone');
    expect(CONTRACT_ERROR_KEYS).toContain('AlreadyAtLevel');
    expect(CONTRACT_ERROR_KEYS).toContain('InsufficientFee');
    expect(CONTRACT_ERROR_KEYS).toContain('SubscriptionExpired');
    expect(CONTRACT_ERROR_KEYS).toContain('ContractPaused');
    expect(CONTRACT_ERROR_KEYS).toContain('Unauthorized');
    expect(CONTRACT_ERROR_KEYS).toContain('NoFeesToWithdraw');
    expect(CONTRACT_ERROR_KEYS).toContain('Overflow');
  });
});

describe('extractContractErrorKey', () => {
  describe('named match', () => {
    it.each(CONTRACT_ERROR_KEYS)(
      'recognises "%s" by name in the message',
      (key) => {
        expect(extractContractErrorKey(`Contract error: ${key}`)).toBe(key);
      },
    );

    it('returns the first matching key when multiple names appear', () => {
      // AlreadyInitialized appears first in the keys array
      const result = extractContractErrorKey(
        'AlreadyInitialized and ContractPaused',
      );
      expect(result).toBe('AlreadyInitialized');
    });
  });

  describe('numeric code match', () => {
    it('resolves code 1 → AlreadyInitialized via "Error(Contract, #1)" format', () => {
      expect(extractContractErrorKey('Error(Contract, #1)')).toBe(
        'AlreadyInitialized',
      );
    });

    it('resolves code 7 → InsufficientFee via "Error(Contract, #7)" format', () => {
      expect(extractContractErrorKey('Error(Contract, #7)')).toBe(
        'InsufficientFee',
      );
    });

    it('resolves code 9 → ContractPaused via "error code 9" format', () => {
      expect(extractContractErrorKey('Transaction failed with error code 9')).toBe(
        'ContractPaused',
      );
    });

    it('resolves code 12 → Overflow (last key)', () => {
      expect(extractContractErrorKey('Error(Contract, #12)')).toBe('Overflow');
    });

    it('returns null for out-of-range numeric code', () => {
      expect(extractContractErrorKey('Error(Contract, #99)')).toBeNull();
    });
  });

  describe('no match', () => {
    it('returns null for an unrecognised error string', () => {
      expect(extractContractErrorKey('Something totally unknown happened')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(extractContractErrorKey('')).toBeNull();
    });
  });
});

describe('parseContractError', () => {
  describe('named key in Error message', () => {
    it('returns the mapped message for a known key inside an Error', () => {
      const err = new Error('RPC call failed: SubscriptionExpired');
      expect(parseContractError(err)).toBe(
        CONTRACT_ERROR_MESSAGES.SubscriptionExpired,
      );
    });

    it('returns the mapped message for InsufficientFee', () => {
      expect(parseContractError(new Error('InsufficientFee'))).toBe(
        CONTRACT_ERROR_MESSAGES.InsufficientFee,
      );
    });
  });

  describe('named key in raw string', () => {
    it('returns the mapped message when error is a plain string', () => {
      expect(parseContractError('ContractPaused')).toBe(
        CONTRACT_ERROR_MESSAGES.ContractPaused,
      );
    });
  });

  describe('numeric code in Error message', () => {
    it('resolves via numeric code in Error message', () => {
      const err = new Error('Failed: Error(Contract, #3)');
      expect(parseContractError(err)).toBe(
        CONTRACT_ERROR_MESSAGES.PlayerNotFound,
      );
    });
  });

  describe('ContractPausedError class', () => {
    it('returns ContractPaused message for an error with name ContractPausedError', () => {
      const err = new Error('paused');
      err.name = 'ContractPausedError';
      expect(parseContractError(err)).toBe(
        CONTRACT_ERROR_MESSAGES.ContractPaused,
      );
    });
  });

  describe('raw JSON blobs', () => {
    it('returns generic fallback when message contains a JSON object', () => {
      const err = new Error('{"status":"failed","reason":"unknown"}');
      expect(parseContractError(err)).toBe(
        'Transaction failed. Please try again or contact support.',
      );
    });

    it('extracts numeric code buried inside JSON when present', () => {
      const err = new Error('{"code":8,"detail":"expired"}');
      expect(parseContractError(err)).toBe(
        CONTRACT_ERROR_MESSAGES.SubscriptionExpired,
      );
    });

    it('returns code-hint message for out-of-range code in JSON', () => {
      const err = new Error('{"code":99,"detail":"unknown"}');
      expect(parseContractError(err)).toBe(
        'Transaction failed (error code 99). Please try again or contact support.',
      );
    });
  });

  describe('fallback behaviour', () => {
    it('returns the raw message when it is short and readable', () => {
      expect(parseContractError(new Error('Wallet not connected'))).toBe(
        'Wallet not connected',
      );
    });

    it('returns generic fallback for a long unrecognised message', () => {
      const long = 'x'.repeat(200);
      expect(parseContractError(new Error(long))).toBe(
        'Transaction failed. Please try again or contact support.',
      );
    });

    it('handles non-Error non-string thrown values', () => {
      expect(parseContractError(42)).toBe('42');
      expect(parseContractError(null)).toBe('null');
      expect(parseContractError(undefined)).toBe('undefined');
    });
  });
});
