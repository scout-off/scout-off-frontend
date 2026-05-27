#!/bin/bash
set -e

cd /workspaces/scout-off-frontend

echo "========================================"
echo "Running TypeScript Type Check"
echo "========================================"
npx tsc --noEmit

echo ""
echo "========================================"
echo "Running Linting"
echo "========================================"
npm run lint

echo ""
echo "========================================"
echo "Running Tests"
echo "========================================"
npm test -- --passWithNoTests --verbose

echo ""
echo "========================================"
echo "All checks passed successfully!"
echo "========================================"
