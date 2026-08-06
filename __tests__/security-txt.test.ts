/**
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

describe('security.txt RFC 9116 compliance', () => {
  const securityTxtPath = path.join(
    process.cwd(),
    'public',
    '.well-known',
    'security.txt',
  );

  it('should exist in public/.well-known/ directory', () => {
    expect(fs.existsSync(securityTxtPath)).toBe(true);
  });

  it('should contain required Contact field', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');
    expect(content).toMatch(/^Contact:/m);
  });

  it('should contain Expires field with future date', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');
    const expiresMatch = content.match(/^Expires:\s*(.+)$/m);

    expect(expiresMatch).toBeTruthy();

    if (expiresMatch) {
      const expiresDate = new Date(expiresMatch[1]);
      const now = new Date();

      expect(expiresDate.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('should contain Canonical field with https URL', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');
    expect(content).toMatch(
      /^Canonical:\s*https:\/\/.+\/\.well-known\/security\.txt$/m,
    );
  });

  it('should contain Policy field referencing SECURITY.md', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');
    expect(content).toMatch(/^Policy:.+SECURITY\.md/m);
  });

  it('should contain Preferred-Languages field', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');
    expect(content).toMatch(/^Preferred-Languages:/m);
  });

  it('should be valid text/plain format', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');

    // Should not contain HTML tags
    expect(content).not.toMatch(/<[^>]+>/);

    // Should use plain text with comments starting with #
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(
      (line) => line.trim() && !line.trim().startsWith('#'),
    );

    nonEmptyLines.forEach((line) => {
      // Each non-comment line should follow the field: value format
      if (!line.trim().startsWith('#')) {
        expect(line).toMatch(/^[A-Z][a-zA-Z-]+:\s*.+$/);
      }
    });
  });

  it('should reference the GitHub Security Advisory for Contact', () => {
    const content = fs.readFileSync(securityTxtPath, 'utf-8');
    expect(content).toMatch(
      /^Contact:\s*https:\/\/github\.com\/.+\/security\/advisories\/new$/m,
    );
  });
});

describe('SECURITY.md exists', () => {
  const securityMdPath = path.join(process.cwd(), 'SECURITY.md');

  it('should exist in project root', () => {
    expect(fs.existsSync(securityMdPath)).toBe(true);
  });

  it('should contain reporting instructions', () => {
    const content = fs.readFileSync(securityMdPath, 'utf-8');
    expect(content).toMatch(/report/i);
    expect(content).toMatch(/vulnerability/i);
  });

  it('should contain Security Advisory link', () => {
    const content = fs.readFileSync(securityMdPath, 'utf-8');
    expect(content).toMatch(/security\/advisories\/new/);
  });
});
