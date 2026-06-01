#!/usr/bin/env node
// Checks every NEXT_PUBLIC_ and server-side env var used in source
// is declared in .env.example. Fails CI if any are missing.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const example = fs.readFileSync(
  path.join(__dirname, '../.env.example'),
  'utf8',
);
const declared = new Set(example.match(/^[A-Z_]+(?==)/gm) ?? []);

const used = new Set(
  execSync(
    'grep -roh "process\\.env\\.[A-Z_]\\+" --include="*.ts" --include="*.tsx" .',
  )
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((m) => m.replace('process.env.', '')),
);

const missing = [...used].filter((v) => !declared.has(v));
if (missing.length) {
  console.error('Missing from .env.example:', missing.join(', '));
  process.exit(1);
}
console.log(`✓ All ${used.size} env vars declared in .env.example`);
