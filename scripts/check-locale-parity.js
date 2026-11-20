#!/usr/bin/env node
// Asserts that every messages/*.json locale file defines the same nested key
// set, so adding a translation key in one locale can't silently leave the
// others untranslated. Exits non-zero (failing CI) on any mismatch.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "messages");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

if (files.length < 2) {
  console.error("✗ Expected at least 2 locale message files, found", files.length);
  process.exit(1);
}

function collectKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...collectKeys(v, key));
    } else {
      out.push(key);
    }
  }
  return out.sort();
}

const keysByFile = {};
for (const f of files) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  keysByFile[f] = collectKeys(json);
}

const ref = files[0];
const refKeys = keysByFile[ref];
let ok = true;

for (const f of files.slice(1)) {
  const missing = refKeys.filter((k) => !keysByFile[f].includes(k));
  const extra = keysByFile[f].filter((k) => !refKeys.includes(k));
  if (missing.length || extra.length) {
    ok = false;
    console.error(
      `✗ ${f} differs from ${ref}:` +
        (missing.length ? ` missing [${missing.join(", ")}]` : "") +
        (extra.length ? ` extra [${extra.join(", ")}]` : "")
    );
  }
}

if (!ok) {
  process.exit(1);
}
console.log(
  `✓ Locale key parity OK across ${files.length} locales (${refKeys.length} keys)`
);
