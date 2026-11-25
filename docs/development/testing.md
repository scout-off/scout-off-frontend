# Testing & Verification

Checks to run after [setup](setup.md) to confirm the stack works end to end. See also [e2e/README.md](../../e2e/README.md) for the Playwright suite.

## Verification Checklist

After following all steps, verify the full stack is working:

```bash
# Env validation
node scripts/validate-env.js

# Frontend builds without errors
npm run dev
# Open http://localhost:3000 — should see landing page

# Contract is reachable
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- health

# Tests pass
npm run test

# Lint passes
npm run lint
```

---
