/**
 * Parsing and drafting for `content/changelog.md` (issue #1722). The parser is
 * used by the public changelog page; the drafting helpers are used by
 * `scripts/draft-changelog.mjs` to turn conventional commits into a new entry.
 *
 * Kept dependency-free (no `@/` imports) so the release script can load it
 * directly with Node's TypeScript type stripping.
 */

export type ChangelogSectionType = 'added' | 'improved' | 'fixed';

export interface ChangelogEntry {
  title: string;
  date: string;
  sections: Array<{
    type: ChangelogSectionType;
    items: string[];
  }>;
}

export function parseChangelogMarkdown(markdown: string): ChangelogEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;
  let currentSection: ChangelogEntry['sections'][number] | null = null;

  const flushEntry = () => {
    if (currentEntry && currentEntry.sections.length > 0) {
      entries.push(currentEntry);
    }
    currentEntry = null;
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith('## ')) {
      flushEntry();
      const match = line.match(/^##\s+(.+?)\s+-\s+(\d{4}-\d{2}-\d{2})$/);
      if (match) {
        currentEntry = {
          title: match[1].trim(),
          date: match[2],
          sections: [],
        };
      }
      continue;
    }

    if (line.startsWith('### ')) {
      if (!currentEntry) {
        continue;
      }
      const type = line.slice(4).trim().toLowerCase();
      if (type === 'added' || type === 'improved' || type === 'fixed') {
        currentSection = { type: type as ChangelogSectionType, items: [] };
        currentEntry.sections.push(currentSection);
      }
      continue;
    }

    if (line.startsWith('- ')) {
      if (currentEntry && currentSection) {
        currentSection.items.push(line.slice(2).trim());
      }
    }
  }

  flushEntry();
  return entries;
}

const TYPE_TO_SECTION: Record<string, ChangelogSectionType> = {
  feat: 'added',
  perf: 'improved',
  refactor: 'improved',
  fix: 'fixed',
};

const SECTION_HEADINGS: Record<ChangelogSectionType, string> = {
  added: 'Added',
  improved: 'Improved',
  fixed: 'Fixed',
};

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

/**
 * Maps a conventional commit subject to a changelog section and a cleaned,
 * user-facing item, or null for commit types that aren't user-facing
 * (chore, ci, test, docs, build, …) and dependency bumps.
 */
export function classifyCommit(
  subject: string,
): { type: ChangelogSectionType; item: string } | null {
  const match = subject.trim().match(CONVENTIONAL_RE);
  if (!match) return null;
  const [, rawType, scope = '', , description] = match;
  const type = TYPE_TO_SECTION[rawType.toLowerCase()];
  if (!type) return null;
  if (scope.toLowerCase() === 'deps' || /^bump\s/i.test(description)) {
    return null;
  }

  const prRefs = Array.from(description.matchAll(/\(#(\d+)\)/g), (m) => m[1]);
  let item = description
    .replace(/\(#\d+\)/g, '')
    .replace(/\b(?:closes|fixes|resolves)\s+#\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!item) return null;
  item = item.charAt(0).toUpperCase() + item.slice(1);
  if (prRefs.length > 0) {
    item += ` (${prRefs.map((n) => `#${n}`).join(', ')})`;
  }
  return { type, item };
}

/** Builds an entry from commit subjects, or null when none are user-facing. */
export function buildChangelogEntry(
  subjects: string[],
  title: string,
  date: string,
): ChangelogEntry | null {
  const buckets: Record<ChangelogSectionType, string[]> = {
    added: [],
    improved: [],
    fixed: [],
  };
  for (const subject of subjects) {
    const classified = classifyCommit(subject);
    if (classified && !buckets[classified.type].includes(classified.item)) {
      buckets[classified.type].push(classified.item);
    }
  }
  const sections = (['added', 'improved', 'fixed'] as const)
    .filter((type) => buckets[type].length > 0)
    .map((type) => ({ type, items: buckets[type] }));
  return sections.length > 0 ? { title, date, sections } : null;
}

export function formatChangelogEntry(entry: ChangelogEntry): string {
  const parts = [`## ${entry.title} - ${entry.date}`];
  for (const section of entry.sections) {
    parts.push(`### ${SECTION_HEADINGS[section.type]}`);
    parts.push(section.items.map((item) => `- ${item}`).join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}

/** Inserts a formatted entry above the first existing `## ` entry. */
export function insertChangelogEntry(
  markdown: string,
  entryText: string,
): string {
  const index = markdown.search(/^## /m);
  if (index === -1) {
    return `${markdown.trimEnd()}\n\n${entryText}`;
  }
  return `${markdown.slice(0, index)}${entryText}\n${markdown.slice(index)}`;
}

/** Date of the newest entry in the changelog, or null. */
export function latestChangelogDate(markdown: string): string | null {
  return parseChangelogMarkdown(markdown)[0]?.date ?? null;
}
