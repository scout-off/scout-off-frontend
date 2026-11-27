import {
  normalizeReferralCode,
  REFERRAL_LIMIT_REACHED,
} from '@/lib/referralCode';

describe('normalizeReferralCode (#1777)', () => {
  it('trims and upper-cases codes', () => {
    expect(normalizeReferralCode('scout-ab12cd')).toBe('SCOUT-AB12CD');
    expect(normalizeReferralCode('  SCOUT-AB12CD ')).toBe('SCOUT-AB12CD');
    expect(normalizeReferralCode('Scout-Ab12cd')).toBe('SCOUT-AB12CD');
  });

  it('returns an empty string for missing or blank values', () => {
    expect(normalizeReferralCode(null)).toBe('');
    expect(normalizeReferralCode(undefined)).toBe('');
    expect(normalizeReferralCode('   ')).toBe('');
  });

  it('exposes the limit error code the backend returns (#1774)', () => {
    expect(REFERRAL_LIMIT_REACHED).toBe('REFERRAL_LIMIT_REACHED');
  });
});
