# End-to-End Local Development Setup

This guide walks you from a freshly cloned repository to a fully running local stack: Stellar testnet contracts, backend API, Next.js frontend, and wallet connection. It assumes no prior project context. Target time: under 30 minutes.

---

## Prerequisites

| Tool                         | Version / Requirement                                       | Check                          |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------ |
| **Node.js**                  | 20.x or later                                               | `node --version`               |
| **npm**                      | 10.x or later (bundled with Node)                           | `npm --version`                |
| **Rust** (stable)            | 1.70+                                                       | `rustc --version`              |
| **wasm32 target**            | `wasm32-unknown-unknown`                                    | `rustup target list --installed` |
| **Stellar CLI**              | Latest (`stellar --version` ≥ 22.0)                         | `stellar --version`            |
| **Freighter** (browser ext.) | [Freighter Wallet](https://www.freighter.app/) in Chrome/Firefox | Check extensions list    |
| **Git**                      | Any recent version                                          | `git --version`                |

### Install missing prerequisites

```bash
# Rust + wasm32 target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI (macOS/Linux)
cargo install stellar-cli --locked

# Stellar CLI (Windows)
# Download from https://github.com/stellar/stellar-cli/releases

# Freighter browser extension
# Install from https://www.freighter.app/
```

---

## Step-by-Step Setup

### 1. Clone repositories

The contracts live in a separate `scout-off-contracts` repository, expected as a sibling directory.

```bash
git clone https://github.com/scout-off/scout-off-frontend.git
git clone https://github.com/scout-off/scout-off-contracts.git
```

Your directory layout should be:

```
projects/
├── scout-off-frontend/
└── scout-off-contracts/
```

### 2. Install frontend dependencies

```bash
cd scout-off-frontend
npm install
```

This also installs Husky pre-commit hooks via the `prepare` script. If hooks are missing, run:

```bash
npm run prepare
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values. At minimum you need these for local dev:

| Variable                   | Value                                          |
| -------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_NETWORK`      | `testnet`                                      |
| `NEXT_PUBLIC_HORIZON_URL`  | `https://horizon-testnet.stellar.org`          |
| `NEXT_PUBLIC_SOROBAN_RPC`  | `https://soroban-testnet.stellar.org`          |
| `NEXT_PUBLIC_API_URL`      | `http://localhost:4000`                        |
| `NEXT_PUBLIC_CONTRACT_ID`  | _Leave blank for now; fill in after step 6_   |
| `NEXT_PUBLIC_ADMIN_ADDRESS`| Your testnet wallet public key                |
| `PINATA_API_KEY`           | _Optional for local dev (IPFS uploads)_        |
| `PINATA_SECRET`            | _Optional for local dev (IPFS uploads)_        |
| `STELLAR_SECRET_KEY`       | Your testnet wallet secret key                |
| `NEXT_PUBLIC_APP_URL`      | `http://localhost:3000`                        |

Validate that all expected variables are declared:

```bash
node scripts/validate-env.js
```

Expected output: `✓ All N env vars declared in .env.example`

### 4. Create and fund a Stellar testnet account

If you don't have a testnet keypair yet, generate one with Stellar CLI:

```bash
stellar keys generate --global deployer --network testnet
stellar keys address deployer
```

Copy the public key and fund it via Friendbot:

```
https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>
```

Or use the CLI:

```bash
curl "https://friendbot.stellar.org/?addr=$(stellar keys address deployer)"
```

This deposits 10,000 testnet XLM into your account.

### 5. Build and deploy smart contracts

```bash
cd ../scout-off-contracts

# Build optimized WASM
cargo build --target wasm32-unknown-unknown --release
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/scout_off.wasm

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/scout_off.optimized.wasm \
  --source deployer \
  --network testnet
```

The deploy command outputs a **contract ID** (a 56-character string starting with `C`). Copy it.

### 6. Initialize the contract

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin $(stellar keys address deployer) \
  --platform_token <TOKEN_ADDRESS> \
  --fee_config '{"contact_fee": "1", "subscription_tiers": [...]}'
```

For local development, you can use the native XLM token address: `CB64D3G7SM2RTH6JSGG34GIGZZRLPMURK7HJEID2ZMWHOWF65BV7D2XX`. Adjust `fee_config` per your contract's expected format.

### 7. Update .env.local with the contract ID

Back in the frontend directory, add your deployed contract ID to `.env.local`:

```env
NEXT_PUBLIC_CONTRACT_ID=<your-deployed-contract-id>
```

Run validation again:

```bash
node scripts/validate-env.js
```

### 8. Start the backend API (if available)

The frontend expects a backend API at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). If the backend API repository is available, start it in a separate terminal. The frontend will function without it for read-only operations; write operations (player registration, milestone approval) require the API for off-chain data.

If you don't have the backend, you can still browse the UI and interact with the contract directly via the Stellar SDK calls in the frontend hooks.

### 9. Start the frontend

```bash
cd scout-off-frontend
npm run dev
```

Open **http://localhost:3000** in your browser.

### 10. Connect Freighter wallet

1. Open the Freighter browser extension.
2. Switch the network to **Testnet** in Freighter settings.
3. In the browser, navigate to the app and click **Connect Wallet**.
4. Select **Freighter** and approve the connection.
5. The app will perform SEP-10 authentication — this requests a signature from your wallet.

---

## Common First-Run Errors

### Error 1: Missing environment variable (`validate-env` failure)

**Symptom:** Running `node scripts/validate-env.js` outputs:

```
Missing from .env.example: SOME_VAR_NAME
```

This means a `process.env.SOME_VAR_NAME` is referenced in source code (`.ts` / `.tsx` files) but is not declared in `.env.example`.

**Solution:**
- If it's a new variable you need: add it to `.env.example` and `.env.local` with a value.
- If it's a stale reference: search for the variable in the codebase and remove it, or add it to `.env.example`.

Do not skip this check — CI runs it on every PR.

### Error 2: Unfunded testnet account

**Symptom:** Any contract call fails with an error containing:

```
transaction submit failed
op_underfunded
Resource temporarily unavailable
```

Or wallet operations show `"account not found"` / `"insufficient balance"`.

**Solution:**
1. Verify your account exists on testnet: visit `https://horizon-testnet.stellar.org/accounts/<YOUR_PUBLIC_KEY>`.
2. If you get a 404, the account hasn't been created yet — fund it via Friendbot:
   ```
   https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>
   ```
3. Wait ~5 seconds for the ledger to close, then retry.
4. **Note:** Friendbot has rate limits (1 request per ~30 seconds per account). If you hit the limit, wait and retry.

### Error 3: Wrong network (testnet vs. mainnet mismatch)

**Symptom:** App loads but contract calls return `"contract not found"` or the wallet shows an incorrect balance. The app may display "contract not initialized" even though you deployed it.

This happens when one component of the stack is on the wrong network.

**Checklist:**
1. `.env.local` → `NEXT_PUBLIC_NETWORK=testnet` (not `mainnet`)
2. `.env.local` → `NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org`
3. `.env.local` → `NEXT_PUBLIC_SOROBAN_RPC=https://soroban-testnet.stellar.org`
4. Freighter extension → switch network to **Testnet** in the extension dropdown
5. Contract deployed with `--network testnet` (check with `stellar contract invoke --id <CONTRACT_ID> --network testnet -- health`)

**Fix:** Align all three layers (env config, wallet extension, and contract deployment) to testnet. Restart the dev server after changing env vars:

```bash
# Ctrl+C to stop, then:
npm run dev
```

---

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

## Related Documentation

- [README.md](README.md) — project overview, architecture, and smart contract API
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow and branch conventions
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment notes (Vercel, analytics)
