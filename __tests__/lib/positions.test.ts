import { FOOTBALL_POSITIONS } from '@/lib/positions';

const EXPECTED_VALUES = [
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LW',
  'RW',
  'ST',
  'CF',
] as const;

describe('FOOTBALL_POSITIONS', () => {
  test('is non-empty', () => {
    expect(FOOTBALL_POSITIONS.length).toBeGreaterThan(0);
  });

  test('contains all expected positions', () => {
    const values = FOOTBALL_POSITIONS.map((p) => p.value);
    for (const v of EXPECTED_VALUES) {
      expect(values).toContain(v);
    }
  });

  test('has no duplicate entries', () => {
    const values = FOOTBALL_POSITIONS.map((p) => p.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test('each entry has non-empty strings for label and value', () => {
    for (const p of FOOTBALL_POSITIONS) {
      expect(p.label).toBeTruthy();
      expect(typeof p.label).toBe('string');
      expect(p.value).toBeTruthy();
      expect(typeof p.value).toBe('string');
    }
  });
});
