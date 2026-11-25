/**
 * Reverse-tabnabbing guard (#725).
 *
 * ESLint's `react/jsx-no-target-blank` covers JSX links. This test also
 * covers what the lint rule cannot see: `window.open(url, '_blank')` calls
 * and `target="_blank"` inside non-JSX strings (HTML templates, markdown
 * rendered as HTML). Every new tab must be opened with `noopener`, or the
 * opened page can use `window.opener` to navigate this tab.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks', 'context'];
const SKIP = /(__tests__|\.stories\.|\.test\.|node_modules)/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) && !SKIP.test(full) ? [full] : [];
  });
}

const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)));

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

describe('external links open without window.opener (#725)', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every target="_blank" element also sets rel="noopener noreferrer"', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const pattern = /target=(?:"_blank"|'_blank'|\{\s*["']_blank["']\s*\})/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        const start = text.lastIndexOf('<', match.index);
        const end = text.indexOf('>', match.index);
        const tag = text.slice(start, end === -1 ? undefined : end);
        const rel = /rel=(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})/.exec(tag);
        const value = rel ? rel[1] ?? rel[2] ?? rel[3] ?? '' : '';
        if (!/\bnoopener\b/.test(value) || !/\bnoreferrer\b/.test(value)) {
          offenders.push(`${path.relative(ROOT, file)}:${lineOf(text, match.index)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every window.open(..., '_blank') passes noopener", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const pattern = /window\.open\(([^;]*?)\)/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        const args = match[1];
        if (/_blank/.test(args) && !/noopener/.test(args)) {
          offenders.push(`${path.relative(ROOT, file)}:${lineOf(text, match.index)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
