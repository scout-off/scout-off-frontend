# ScoutOff — Deployment Guide

This guide covers end-to-end production deployment of the ScoutOff frontend (Next.js) and smart contracts (Soroban/Rust). Follow every section in order. For initial local setup, see the [Quick Start](README.md#quick-start) section in the README.

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20.x | https://nodejs.org |
| npm | 10.x (bundled with Node 20) | — |
| Rust + `wasm32` target | stable | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI (`stellar`) | 21.x | https://developers.stellar.org/docs/tools/stellar-cli |
| Vercel CLI (`vercel`) | latest | `npm i -g vercel` |

Verify:

```bash
node -v          # v20.x.x
stellar --version
vercel --version
```

---

## Part 1 — Smart Contract Deployment

### 1.1 Build the contract

Run from the `scout-off-contracts` directory (sibling of this repo):

```bash
cd ../scout-off-contracts
cargo build --target wasm32-unknown-unknown --release
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/scout_off.wasm
```

The optimized artifact is written to:
`target/wasm32-unknown-unknown/release/scout_off.optimized.wasm`

---

### 1.2 Deploy to Testnet

```bash
# 1. Fund a deployer account on Testnet (one-time)
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet

# 2. Deploy the optimized WASM
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/scout_off.optimized.wasm \
  --source deployer \
  --network testnet
# → prints CONTRACT_ID — save this value

# 3. Initialize the contract (one-time, fails if called twice)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <ADMIN_STELLAR_ADDRESS> \
  --platform_token <TOKEN_CONTRACT_ADDRESS> \
  --fee_config '{"contact_fee":10000000}'
  # contact_fee is in stroops (1 XLM = 10_000_000 stroops)

# 4. Verify the contract is live
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- health
# → should return true
```

---

### 1.3 Deploy to Mainnet

> **Warning:** Mainnet transactions are irreversible and cost real XLM. Double-check every argument before submitting.

```bash
# 1. Ensure the deployer key is funded on Mainnet
stellar keys fund deployer --network mainnet   # only works on Testnet/Futurenet
# For Mainnet, fund the deployer address manually via an exchange or wallet.

# 2. Deploy
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/scout_off.optimized.wasm \
  --source deployer \
  --network mainnet
# → prints CONTRACT_ID — save this value

# 3. Initialize (one-time)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network mainnet \
  -- initialize \
  --admin <ADMIN_STELLAR_ADDRESS> \
  --platform_token <TOKEN_CONTRACT_ADDRESS> \
  --fee_config '{"contact_fee":10000000}'

# 4. Verify
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network mainnet \
  -- health
```

Record the Mainnet `CONTRACT_ID` — it is required for the frontend environment variables.

---

## Part 2 — Frontend Deployment (Vercel)

### 2.1 Build locally first

Always verify the build passes before deploying:

```bash
cd scout-off-frontend
npm ci
npm run build
```

A successful build prints `✓ Compiled successfully` with no type errors.

### 2.2 Run environment validation

```bash
node scripts/validate-env.js
```

This script checks that every `process.env.*` reference in the source is declared in `.env.example`. Fix any reported missing variables before proceeding.

### 2.3 Configure environment variables on Vercel

In the Vercel dashboard → Project → Settings → Environment Variables, add **all** variables from the table in [Part 3](#part-3--environment-variables). Set each variable for the correct environment scope (Production / Preview / Development).

Alternatively, use the CLI:

```bash
vercel env add NEXT_PUBLIC_CONTRACT_ID production
vercel env add NEXT_PUBLIC_NETWORK production
# ... repeat for every variable in Part 3
```

> **Security:** `PINATA_API_KEY`, `PINATA_SECRET`, and `PLATFORM_CONTACT_FEE_XLM` are server-side only. Do **not** prefix them with `NEXT_PUBLIC_` and do not expose them in client-side code.

### 2.4 Deploy to Vercel

**First deployment (project setup):**

```bash
cd scout-off-frontend
vercel --prod
```

Follow the interactive prompts to link the project to your Vercel account and organisation. Vercel auto-detects Next.js and sets the build command to `npm run build` and output directory to `.next`.

**Subsequent deployments:**

```bash
vercel --prod
```

Or push to `main` — the CI workflow (`.github/workflows/ci.yml`) runs lint, tests, and env validation on every push. Vercel's GitHub integration triggers a production deployment automatically when the CI passes.

### 2.5 Post-deployment verification

```bash
# 1. Check the deployment URL returned by Vercel
curl -I https://<your-vercel-url>
# → HTTP/2 200

# 2. Re-run env validation against the live build environment
node scripts/validate-env.js

# 3. Invoke the contract health check from the frontend
# Open the deployed URL, connect a wallet, and confirm the app loads
# without console errors related to missing env vars or RPC failures.
```

---

## Part 3 — Environment Variables

All variables must be set in Vercel before deploying to production. Variables without a `NEXT_PUBLIC_` prefix are server-side only and are never sent to the browser.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ID` | ✅ Yes | Deployed ScoutOff Soroban contract address (from Part 1) |
| `NEXT_PUBLIC_NETWORK` | ✅ Yes | `testnet` or `mainnet` — controls which Stellar network the app connects to |
| `NEXT_PUBLIC_HORIZON_URL` | ✅ Yes | Stellar Horizon REST endpoint. Testnet: `https://horizon-testnet.stellar.org`. Mainnet: `https://horizon.stellar.org` |
| `NEXT_PUBLIC_SOROBAN_RPC` | ✅ Yes | Soroban RPC endpoint. Testnet: `https://soroban-testnet.stellar.org`. Mainnet: `https://soroban-rpc.mainnet.stellar.gateway.fm` (or your own node) |
| `NEXT_PUBLIC_IPFS_GATEWAY` | ✅ Yes | IPFS gateway for serving player media. Default: `https://gateway.pinata.cloud/ipfs` |
| `NEXT_PUBLIC_API_URL` | ✅ Yes | Base URL of the Node.js backend API. Production example: `https://api.scoutoff.app` |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | ✅ Yes | Stellar public key of the contract admin wallet. Used client-side to gate admin UI. |
| `PINATA_API_KEY` | ✅ Yes | Pinata API key for server-side IPFS uploads via `/api/ipfs/upload`. Never exposed to the browser. |
| `PINATA_SECRET` | ✅ Yes | Pinata secret key. Server-side only. Never exposed to the browser. |
| `PLATFORM_CONTACT_FEE_XLM` | ✅ Yes | XLM fee charged for pay-to-contact. Default: `1`. Must match the value set in `fee_config` during contract initialization. |
| `NEXT_PUBLIC_SENTRY_DSN` | ⬜ Optional | Sentry DSN for error reporting. Leave blank to disable Sentry entirely. |

---

## Part 4 — Rollback

### 4.1 Rolling back a frontend deployment on Vercel

Vercel retains all previous deployments. To revert:

**Via the dashboard:**
1. Go to Vercel → Project → Deployments
2. Find the last known-good deployment
3. Click the `⋯` menu → **Promote to Production**

**Via the CLI:**

```bash
# List recent deployments
vercel ls

# Promote a specific deployment URL to production
vercel promote <deployment-url>
```

The rollback is instant — no rebuild required. The previous deployment's environment variables are not restored automatically; if you changed env vars, revert them manually in Settings → Environment Variables.

---

### 4.2 Rolling back a smart contract deployment

> **Important:** Soroban smart contracts are immutable once deployed. There is no `undeploy` command. The strategies below are the only safe options.

#### Testnet rollback

Testnet state is reset periodically by the Stellar Foundation. For an immediate rollback:

1. Re-deploy the previous WASM artifact:
   ```bash
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/scout_off_previous.optimized.wasm \
     --source deployer \
     --network testnet
   # → new CONTRACT_ID
   ```
2. Initialize the new contract.
3. Update `NEXT_PUBLIC_CONTRACT_ID` in Vercel to the new contract address and redeploy the frontend.

Keep previous WASM artifacts in version control or a release registry so they can be re-deployed.

#### Mainnet rollback

There is no way to modify or delete a deployed Mainnet contract. Safe options:

1. **Pause the faulty contract** (if the bug is exploitable):
   ```bash
   stellar contract invoke \
     --id <FAULTY_CONTRACT_ID> \
     --source deployer \
     --network mainnet \
     -- pause_contract
   ```
   This blocks all write operations while preserving state. Only the admin key can unpause.

2. **Deploy a fixed contract** alongside the paused one:
   ```bash
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/scout_off_fixed.optimized.wasm \
     --source deployer \
     --network mainnet
   # → new CONTRACT_ID
   ```
   Initialize it, then update `NEXT_PUBLIC_CONTRACT_ID` in Vercel and redeploy the frontend.

3. **Limitations:**
   - On-chain state (player profiles, milestones, subscriptions) in the old contract cannot be migrated automatically. A migration script must be written and executed if data continuity is required.
   - The admin key must be kept secure and offline when not in use. Loss of the admin key means `pause_contract` and `withdraw_fees` can never be called.

---

## Part 5 — CI/CD Reference

The GitHub Actions workflow at `.github/workflows/ci.yml` runs on every push and pull request to `main`:

1. `npm ci` — clean install
2. `npm run lint` — ESLint
3. `npm run test` — Jest
4. `node scripts/validate-env.js` — env var completeness check

All four steps must pass before a Vercel production deployment is triggered via the GitHub integration. Do not bypass CI by deploying directly from a feature branch to production.
