import {
  fuzzyScore,
  levenshteinDistance,
  rankByFuzzyMatch,
} from '@/lib/fuzzyMatch';

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('diallo', 'diallo')).toBe(0);
  });

  it('counts a single substitution', () => {
    expect(levenshteinDistance('diallo', 'dialo')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });
});

describe('fuzzyScore', () => {
  it('scores an exact match (case-insensitive) as 1', () => {
    expect(fuzzyScore('Amara Diallo', 'amara diallo')).toBe(1);
  });

  it('scores a substring match highly but below exact', () => {
    const score = fuzzyScore('Amara', 'Amara Diallo');
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('scores a minor typo highly', () => {
    const score = fuzzyScore('Amara Dialo', 'Amara Diallo');
    expect(score).toBeGreaterThan(0.7);
  });

  it('scores unrelated strings low', () => {
    const score = fuzzyScore('xyz', 'Amara Diallo');
    expect(score).toBeLessThan(0.4);
  });

  it('returns 0 for a blank query', () => {
    expect(fuzzyScore('  ', 'Amara Diallo')).toBe(0);
  });
});

describe('rankByFuzzyMatch', () => {
  const players = [
    { id: '1', name: 'Amara Diallo' },
    { id: '2', name: 'Kwame Boateng' },
    { id: '3', name: 'Amaka Diallo' },
  ];

  it('returns items unchanged when the query is blank', () => {
    expect(rankByFuzzyMatch(players, '', (p) => p.name)).toEqual(players);
  });

  it('ranks the exact match first', () => {
    const ranked = rankByFuzzyMatch(players, 'Amara Diallo', (p) => p.name);
    expect(ranked[0].id).toBe('1');
  });

  it('tolerates a typo and still surfaces the intended player', () => {
    const ranked = rankByFuzzyMatch(players, 'Amara Dialo', (p) => p.name);
    expect(ranked.map((p) => p.id)).toContain('1');
    expect(ranked[0].id).toBe('1');
  });

  it('drops candidates below the similarity threshold', () => {
    const ranked = rankByFuzzyMatch(players, 'zzzzz', (p) => p.name);
    expect(ranked).toEqual([]);
  });
});
