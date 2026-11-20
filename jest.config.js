/** @type {import('jest').Config} */
module.exports = {
  // Unit tests live under __tests__/. Keep the Playwright e2e specs (e2e/*.spec.ts)
  // out of jest so `npm run test` stays green; run them with `npm run test:e2e`.
  testMatch: [
    "<rootDir>/__tests__/**/*.test.{ts,tsx,js,jsx}",
    "<rootDir>/__tests__/**/*.spec.{ts,tsx,js,jsx}",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "/\\.next/"],
};
