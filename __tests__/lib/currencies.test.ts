import { getCurrencyLabel } from '@/lib/currencies';

describe('getCurrencyLabel', () => {
  it('renders an English name with the symbol for en', () => {
    expect(getCurrencyLabel('USD', 'en')).toBe('US Dollar ($)');
  });

  it('renders a localized name for fr', () => {
    expect(getCurrencyLabel('USD', 'fr')).not.toBe(
      getCurrencyLabel('USD', 'en'),
    );
  });

  it('degrades gracefully for sw regardless of ICU support', () => {
    expect(getCurrencyLabel('KES', 'sw')).toEqual(expect.any(String));
    expect(getCurrencyLabel('KES', 'sw').length).toBeGreaterThan(0);
  });

  it('falls back to the English label for an invalid locale', () => {
    expect(getCurrencyLabel('NGN', 'not a locale!')).toBe('Nigerian Naira (₦)');
  });
});
