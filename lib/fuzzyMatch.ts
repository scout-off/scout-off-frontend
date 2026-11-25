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

/** Longest candidate prefix considered, bounding the O(n·m) Levenshtein cost. */
const MAX_CANDIDATE_LENGTH = 100;

/**
 * Normalises text for search: strips diacritics ("Kanté" → "kante",
 * "Ọlá" → "ola"), lowercases, drops apostrophes, turns other punctuation
 * into spaces and collapses whitespace. Exported so server-side search can
 * apply the same normalisation.
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Similarity in [0, 1] between a single query token and candidate token. */
function tokenScore(q: string, c: string): number {
  if (q === c) return 1;
  if (c.startsWith(q)) return 0.95;
  if (c.includes(q)) return 0.9;
  const maxLen = Math.max(q.length, c.length);
  // Tokens whose lengths differ by more than 50% are never a typo match.
  if (Math.abs(q.length - c.length) > maxLen / 2) return 0;
  return 1 - levenshteinDistance(q, c) / maxLen;
}

/**
 * Similarity score in [0, 1] between a search query and a candidate string.
 * Both are normalised with {@link normalizeForSearch}. 1 = exact match,
 * 0.9 = whole-string substring match. Otherwise each query token is scored
 * against its best candidate token and averaged (plus a small bonus when
 * token order matches), scaled to stay below the substring score so exact
 * and substring matches always rank first.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const q = normalizeForSearch(query);
  const c = normalizeForSearch(candidate.slice(0, MAX_CANDIDATE_LENGTH));
  if (!q) return 0;
  if (c === q) return 1;
  if (c.includes(q)) return 0.9;

  const qTokens = q.split(' ');
  const cTokens = c.split(' ');
  let total = 0;
  let lastIndex = -1;
  let inOrder = true;
  for (const qt of qTokens) {
    let best = 0;
    let bestIndex = -1;
    cTokens.forEach((ct, i) => {
      const score = tokenScore(qt, ct);
      if (score > best) {
        best = score;
        bestIndex = i;
      }
    });
    total += best;
    if (bestIndex <= lastIndex) inOrder = false;
    lastIndex = bestIndex;
  }
  const average = total / qTokens.length;
  return average * 0.85 + (inOrder && qTokens.length > 1 ? 0.04 : 0);
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
