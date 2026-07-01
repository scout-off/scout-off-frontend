#!/usr/bin/env node
// Checks every NEXT_PUBLIC_ and server-side env var used in source
// is declared in .env.example. Fails CI if any are missing.
const fs = require('fs');
const path = require('path');

const example = fs.readFileSync(
  path.join(__dirname, '../.env.example'),
  'utf8',
);
const declared = new Set(example.match(/^[A-Z0-9_]+(?==)/gm) ?? []);

const SYSTEM_VARS = new Set(['NODE_ENV']);

const ENV_VAR_PATTERN = /process\.env\.([A-Z0-9_]+)/g;
const SKIP_DIRS = new Set(['node_modules', '.next', 'coverage', '.git']);

function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const root = path.join(__dirname, '..');
const sourceFiles = walkDir(root);

const used = new Set();
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = ENV_VAR_PATTERN.exec(content)) !== null) {
    const varName = match[1];
    if (!SYSTEM_VARS.has(varName)) {
      used.add(varName);
    }
  }
  ENV_VAR_PATTERN.lastIndex = 0;
}

const missing = [...used].filter((v) => !declared.has(v));
if (missing.length) {
  console.error('Missing from .env.example:', missing.join(', '));
  process.exit(1);
}
console.log(`✓ All ${used.size} env vars declared in .env.example`);
