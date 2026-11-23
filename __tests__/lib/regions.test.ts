import { AFRICAN_REGIONS } from '@/lib/regions';

const KEY_LABELS = [
  'Nigeria',
  'Kenya',
  'Ghana',
  'South Africa',
  'Egypt',
  'Senegal',
];

describe('AFRICAN_REGIONS', () => {
  test('is non-empty', () => {
    expect(AFRICAN_REGIONS.length).toBeGreaterThan(0);
  });

  test('contains all key African nations', () => {
    const labels = AFRICAN_REGIONS.map((r) => r.label);
    for (const label of KEY_LABELS) {
      expect(labels).toContain(label);
    }
  });

  test('has no duplicate entries', () => {
    const values = AFRICAN_REGIONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test('each entry has non-empty strings for label and value', () => {
    for (const r of AFRICAN_REGIONS) {
      expect(r.label).toBeTruthy();
      expect(typeof r.label).toBe('string');
      expect(r.value).toBeTruthy();
      expect(typeof r.value).toBe('string');
    }
  });

  test('is alphabetically sorted by label', () => {
    const labels = AFRICAN_REGIONS.map((r) => r.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });
});
