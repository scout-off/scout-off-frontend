import { REDIRECT_REASONS, isRedirectReason } from '@/lib/redirectReason';

describe('REDIRECT_REASONS', () => {
  it('contains the wallet-required reason', () => {
    expect(REDIRECT_REASONS['wallet-required']).toBe(
      'You need to connect your wallet to view that page.',
    );
  });

  it('contains the subscription-expired reason', () => {
    expect(REDIRECT_REASONS['subscription-expired']).toBe(
      'Your subscription has expired — please renew to continue.',
    );
  });

  it('has exactly two entries', () => {
    expect(Object.keys(REDIRECT_REASONS)).toHaveLength(2);
  });
});

describe('isRedirectReason', () => {
  it('returns true for each known reason code', () => {
    expect(isRedirectReason('wallet-required')).toBe(true);
    expect(isRedirectReason('subscription-expired')).toBe(true);
  });

  it('returns false for an unrecognised string without throwing', () => {
    expect(isRedirectReason('unknown-reason')).toBe(false);
    expect(isRedirectReason('WALLET-REQUIRED')).toBe(false);
    expect(isRedirectReason('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRedirectReason(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRedirectReason(undefined)).toBe(false);
  });

  it('returns false for an array of strings (as returned by some query param parsers)', () => {
    expect(isRedirectReason(['wallet-required'])).toBe(false);
  });

  it('narrows the type to RedirectReason when true', () => {
    const raw: string | null = 'wallet-required';
    if (isRedirectReason(raw)) {
      // TypeScript should allow indexing REDIRECT_REASONS with raw here
      const message: string = REDIRECT_REASONS[raw];
      expect(typeof message).toBe('string');
    }
  });
});
