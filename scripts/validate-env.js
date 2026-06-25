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

const SYSTEM_VARS = new Set(['NODE_ENV']);

const used = new Set(
  execSync(
    'grep -roh "process\\.env\\.[A-Z_]\\+" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=coverage .',
  )
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((m) => m.replace('process.env.', ''))
    .filter((v) => !SYSTEM_VARS.has(v)),
);

const missing = [...used].filter((v) => !declared.has(v));
if (missing.length) {
  console.error('Missing from .env.example:', missing.join(', '));
  process.exit(1);
}
console.log(`✓ All ${used.size} env vars declared in .env.example`);
