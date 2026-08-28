import {
  TIER_FEES_XLM,
  CONTACT_FEE_XLM,
  DEFAULT_SUBSCRIPTION_FEE_XLM,
  resolveSubscriptionFee,
  resolveContactFee,
} from '@/lib/feeSchedule';

describe('lib/feeSchedule', () => {
  describe('constants', () => {
    it('defines canonical subscription tier fees in XLM', () => {
      expect(TIER_FEES_XLM.basic).toBe(5);
      expect(TIER_FEES_XLM.pro).toBe(12);
      expect(TIER_FEES_XLM.elite).toBe(20);
    });

    it('defines canonical pay-to-contact fee in XLM', () => {
      expect(CONTACT_FEE_XLM).toBe(1);
    });

    it('defines default subscription fee fallback', () => {
      expect(DEFAULT_SUBSCRIPTION_FEE_XLM).toBe(5);
    });
  });

  describe('resolveSubscriptionFee', () => {
    it('prioritizes explicit fee_xlm on event data over tier table', () => {
      const fee = resolveSubscriptionFee({ fee_xlm: 18, tier: 'basic' }, 'basic');
      expect(fee).toBe(18);
    });

    it('prioritizes explicit amount_xlm on event data', () => {
      const fee = resolveSubscriptionFee({ amount_xlm: 25, tier: 'pro' }, 'pro');
      expect(fee).toBe(25);
    });

    it('prioritizes explicit numeric string fee on event data', () => {
      const fee = resolveSubscriptionFee({ fee: '15' });
      expect(fee).toBe(15);
    });

    it('falls back to tier lookup when event data has no explicit fee amount', () => {
      expect(resolveSubscriptionFee({ tier: 'basic' })).toBe(5);
      expect(resolveSubscriptionFee({ tier: 'pro' })).toBe(12);
      expect(resolveSubscriptionFee({ tier: 'elite' })).toBe(20);
    });

    it('falls back to tier parameter when event data is null or undefined', () => {
      expect(resolveSubscriptionFee(null, 'pro')).toBe(12);
      expect(resolveSubscriptionFee(undefined, 'elite')).toBe(20);
    });

    it('falls back to DEFAULT_SUBSCRIPTION_FEE_XLM for unknown or missing tiers', () => {
      expect(resolveSubscriptionFee({ tier: 'non_existent_tier' })).toBe(5);
      expect(resolveSubscriptionFee({})).toBe(5);
      expect(resolveSubscriptionFee(null, null)).toBe(5);
    });
  });

  describe('resolveContactFee', () => {
    it('prioritizes explicit fee_xlm on event data over CONTACT_FEE_XLM', () => {
      const fee = resolveContactFee({ fee_xlm: 3 });
      expect(fee).toBe(3);
    });

    it('prioritizes explicit amount_xlm on event data', () => {
      const fee = resolveContactFee({ amount_xlm: 2.5 });
      expect(fee).toBe(2.5);
    });

    it('prioritizes explicit fee or amount on event data', () => {
      expect(resolveContactFee({ fee: 4 })).toBe(4);
      expect(resolveContactFee({ amount: '5' })).toBe(5);
    });

    it('falls back to canonical CONTACT_FEE_XLM when event data has no explicit amount', () => {
      expect(resolveContactFee({})).toBe(1);
      expect(resolveContactFee(null)).toBe(1);
      expect(resolveContactFee(undefined)).toBe(1);
    });
  });
});
