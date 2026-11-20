#!/usr/bin/env node
// Checks every NEXT_PUBLIC_ and server-side env var used in source
// is declared in .env.example. Fails CI if any are missing.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const example = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
const declared = new Set(example.match(/^[A-Z_]+(?==)/gm) ?? []);

// Search only the application source directories (not the whole tree): grepping
// `.` would also match dependencies under node_modules (e.g. Playwright/SWC
// internals referencing process.env.TEST_WORKER_INDEX) and root config files
// (e.g. playwright.config.ts reading process.env.CI), producing false
// "missing" failures for vars that aren't app configuration.
const sourceDirs = ["app", "components", "context", "hooks", "lib", "types"];
const used = new Set(
  execSync(
    `grep -roh "process\\.env\\.[A-Z_]\\+" --include="*.ts" --include="*.tsx" ${sourceDirs.join(" ")}`
  )
    .toString()
    .split("\n")
    .filter(Boolean)
    .map((m) => m.replace("process.env.", ""))
);

const missing = [...used].filter((v) => !declared.has(v));
if (missing.length) {
  console.error("Missing from .env.example:", missing.join(", "));
  process.exit(1);
}
console.log(`✓ All ${used.size} env vars declared in .env.example`);
