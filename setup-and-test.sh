#!/bin/bash
set -e
cd /workspaces/scout-off-frontend
npm install
echo "Dependencies installed"
npx tsc --noEmit
echo "TypeScript check passed"
npm test -- __tests__/lib/contract.test.ts --passWithNoTests
echo "Tests completed"
