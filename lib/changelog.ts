/**
 * Parser for content/changelog.md (entries: `## Title - YYYY-MM-DD` with
 * `### Added|Improved|Fixed` sections). Shared by the changelog page and
 * scripts/draft-changelog.js tests.
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
        currentSection = { type, items: [] };
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
