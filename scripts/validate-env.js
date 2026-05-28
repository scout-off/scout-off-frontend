#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const example = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
const declared = example
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("=")[0])
  .filter(Boolean);

const missing = declared.filter((name) => !(name in process.env));
if (missing.length) {
  console.log("Missing environment variables:", missing.join(", "));
  process.exit(1);
}
console.log(`All ${declared.length} env vars from .env.example are present`);
