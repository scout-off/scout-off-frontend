#!/usr/bin/env node
/**
 * Counts `i18next/no-literal-string` warnings (hard-coded user-facing strings
 * in JSX, #1697) and prints a per-file inventory. In CI the summary is
 * appended to $GITHUB_STEP_SUMMARY so the count is tracked over time. The
 * rule is in warning mode for now, so this script never fails the build.
 */
const fs = require('fs');
const { ESLint } = require('eslint');

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles([
    'app/**/*.tsx',
    'components/**/*.tsx',
  ]);
  const rows = results
    .map((r) => ({
      file: r.filePath.replace(`${process.cwd()}/`, ''),
      count: r.messages.filter((m) => m.ruleId === 'i18next/no-literal-string')
        .length,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((n, r) => n + r.count, 0);

  const lines = [
    `### Hard-coded JSX strings: ${total} in ${rows.length} file(s)`,
    '',
    '| File | Count |',
    '| --- | --- |',
    ...rows.map((r) => `| \`${r.file}\` | ${r.count} |`),
  ];
  const output = lines.join('\n');
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
