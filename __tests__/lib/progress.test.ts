import {
  PROGRESS_LEVELS,
  getProgressLabel,
  getProgressColor,
} from '@/lib/progress';

describe('PROGRESS_LEVELS', () => {
  it('contains entries for all four levels 0–3', () => {
    expect(PROGRESS_LEVELS).toHaveLength(4);
    expect(PROGRESS_LEVELS.map((p) => p.level)).toEqual([0, 1, 2, 3]);
  });

  it('each entry has a non-empty label and color', () => {
    for (const entry of PROGRESS_LEVELS) {
      expect(entry.label).toBeTruthy();
      expect(entry.color).toBeTruthy();
    }
  });
});

describe('getProgressLabel', () => {
  it('returns "Unverified" for level 0', () => {
    expect(getProgressLabel(0)).toBe('Unverified');
  });

  it('returns "Verified Identity" for level 1', () => {
    expect(getProgressLabel(1)).toBe('Verified Identity');
  });

  it('returns "Performance Milestones" for level 2', () => {
    expect(getProgressLabel(2)).toBe('Performance Milestones');
  });

  it('returns "Elite Tier" for level 3', () => {
    expect(getProgressLabel(3)).toBe('Elite Tier');
  });

  it('returns "Unknown" for an out-of-range level', () => {
    expect(getProgressLabel(99)).toBe('Unknown');
  });
});

describe('getProgressColor', () => {
  it('returns a color for level 0', () => {
    expect(getProgressColor(0)).toBeTruthy();
  });

  it('returns a color for level 1', () => {
    expect(getProgressColor(1)).toBeTruthy();
  });

  it('returns a color for level 2', () => {
    expect(getProgressColor(2)).toBeTruthy();
  });

  it('returns a color for level 3', () => {
    expect(getProgressColor(3)).toBeTruthy();
  });

  it('returns a fallback color for an out-of-range level', () => {
    expect(getProgressColor(99)).toBe('bg-gray-600');
  });

  it('returns distinct colors for each level', () => {
    const colors = [0, 1, 2, 3].map(getProgressColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(4);
  });
});
