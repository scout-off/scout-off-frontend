/**
 * Levenshtein edit distance between two strings — the minimum number of
 * single-character insertions, deletions, or substitutions needed to turn
 * `a` into `b`.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  let currRow = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

/**
 * Similarity score in [0, 1] between a search query and a candidate string.
 * 1 = exact match (case-insensitive), ~0.9 = substring match, otherwise a
 * normalized Levenshtein similarity so a minor typo still scores high.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!q) return 0;
  if (c === q) return 1;
  if (c.includes(q)) return 0.9;

  const distance = levenshteinDistance(q, c);
  const maxLen = Math.max(q.length, c.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

const DEFAULT_THRESHOLD = 0.4;

/**
 * Ranks items by fuzzy match quality against `query`, dropping anything
 * below `threshold` and sorting the rest best-match-first (exact and
 * substring matches always lead). Returns `items` unchanged when `query`
 * is blank.
 */
export function rankByFuzzyMatch<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  threshold: number = DEFAULT_THRESHOLD,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return items;

  return items
    .map((item, index) => ({
      item,
      index,
      score: fuzzyScore(trimmed, getText(item)),
    }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
