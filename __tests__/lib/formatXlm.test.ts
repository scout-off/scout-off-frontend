import { formatXlm, XLM_DISPLAY_DECIMALS, fromStroops } from '@/lib/formatXlm';

describe('formatXlm (display precision, default locale en)', () => {
  it('formats whole numbers with 2 decimal places', () => {
    expect(formatXlm(1)).toBe('1.00');
    expect(formatXlm(12)).toBe('12.00');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatXlm(4.999999)).toBe('5.00');
    expect(formatXlm(1.006)).toBe('1.01');
    expect(formatXlm(0.123456789)).toBe('0.12');
  });

  it('accepts numeric strings', () => {
    expect(formatXlm('5')).toBe('5.00');
    expect(formatXlm('7.5')).toBe('7.50');
  });

  it('falls back to zero for non-finite input', () => {
    expect(formatXlm(NaN)).toBe('0.00');
    expect(formatXlm('not-a-number')).toBe('0.00');
  });

  it('handles zero', () => {
    expect(formatXlm(0)).toBe('0.00');
  });

  it('uses the exported precision constant', () => {
    expect(XLM_DISPLAY_DECIMALS).toBe(2);
    expect(formatXlm(3.14159).split('.')[1]).toHaveLength(XLM_DISPLAY_DECIMALS);
  });
});

describe('formatXlm locale-awareness', () => {
  it('uses grouping separator in en for large amounts', () => {
    expect(formatXlm(1234567.5, 'en')).toBe('1,234,567.50');
  });

  it('uses French locale formatting', () => {
    // French uses narrow no-break space as group separator and comma as decimal
    const result = formatXlm(12.5, 'fr');
    expect(result).toMatch(/12[,.]50|12,50/);
    expect(result).toContain('50');
  });

  it('formats correctly in sw (Swahili) locale', () => {
    const result = formatXlm(5, 'sw');
    expect(result).toContain('00');
  });
});

describe('formatXlm full precision', () => {
  it('shows up to 7 decimal places', () => {
    expect(formatXlm(1.1234567, 'en', { precision: 'full' })).toBe('1.1234567');
  });

  it('strips trailing zeros', () => {
    expect(formatXlm(1.5, 'en', { precision: 'full' })).toBe('1.5');
    expect(formatXlm(1, 'en', { precision: 'full' })).toBe('1');
  });

  it('applies grouping for large amounts', () => {
    expect(formatXlm(1234567.1234567, 'en', { precision: 'full' })).toBe('1,234,567.1234567');
  });
});

describe('fromStroops', () => {
  it('converts stroops to XLM', () => {
    expect(fromStroops(10_000_000)).toBe(1);
    expect(fromStroops(5_000_000)).toBe(0.5);
    expect(fromStroops(1)).toBeCloseTo(0.0000001);
  });

  it('handles string input', () => {
    expect(fromStroops('10000000')).toBe(1);
  });

  it('returns 0 for invalid input', () => {
    expect(fromStroops(NaN)).toBe(0);
  });
});
