#!/bin/bash
set -e

echo "Running Playwright E2E tests..."
npx playwright test e2e/
