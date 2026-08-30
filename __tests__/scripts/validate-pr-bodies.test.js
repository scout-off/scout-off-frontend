const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '../../scripts/validate-pr-bodies.js');
const prBodiesDir = path.join(__dirname, '../../docs/pr-bodies');
const repoRoot = path.join(__dirname, '../..');

describe('validate-pr-bodies.js', () => {
  it('accepts the checked-in docs/pr-bodies fixture files', () => {
    const files = fs
      .readdirSync(prBodiesDir)
      .filter((file) => file.endsWith('.md') && file !== 'README.md');

    expect(files.length).toBeGreaterThan(0);

    const result = spawnSync('node', [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `All ${files.length} body file(s) in docs/pr-bodies/ pass the contract.`,
    );
  });

  it('fails when a body file is missing the required contract headers', () => {
    const tempFile = path.join(prBodiesDir, 'tmp-invalid-pr-body.md');
    const invalidContent = [
      '# Invalid fixture',
      '',
      '## Summary',
      '',
      'This file is intentionally malformed.',
      '',
      '## Validation',
      '',
      'No metadata here.',
      '',
    ].join('\n');

    fs.writeFileSync(tempFile, invalidContent, 'utf8');

    try {
      const result = spawnSync('node', [scriptPath], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('docs/pr-bodies/ contract violations:');
      expect(result.stderr).toContain(
        'tmp-invalid-pr-body.md: missing <!-- Branch: ... --> header',
      );
      expect(result.stderr).toContain(
        'tmp-invalid-pr-body.md: missing <!-- Title: ... --> header',
      );
    } finally {
      fs.unlinkSync(tempFile);
    }
  });
});
