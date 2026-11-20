# Local Development Setup

This guide walks you from a freshly cloned repository to a fully running local stack: Stellar testnet contracts, backend API, Next.js frontend, and wallet connection. It assumes no prior project context. Target time: under 30 minutes.

---

## Docker Compose Quick Start (recommended for first-time contributors)

The full manual setup below (Stellar CLI, a live testnet contract deploy, a real backend API, Pinata credentials) is the most accurate way to develop against real infrastructure, but it's a lot to provision just to make a small frontend change. `docker-compose.yml` brings up a complete local stack — the frontend, the indexer, and mocked local versions of the Soroban RPC and backend API — with a single command and **no external credentials**.

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

This starts four containers:

| Service    | Port | What it is                                                                        |
| ---------- | ---- | --------------------------------------------------------------------------------- |
| `frontend` | 3000 | This Next.js app, built and served in production mode against the mocks below     |
| `indexer`  | 3001 | `packages/indexer`'s HTTP server (`/health`, `/metrics`)                          |
| `mock-rpc` | 8000 | A local mock of the Soroban RPC endpoints `lib/stellar.ts`/`lib/contract.ts` call |
| `mock-api` | 4000 | A local mock of the backend REST API `lib/api.ts` calls (`NEXT_PUBLIC_API_URL`)   |

**What works out of the box:** browsing player profiles and lists, milestone history, validator lists, contract health/paused banners, scout dashboards and profiles, and full write flows (register a player, approve a milestone, subscribe, pay-to-contact) — `mock-rpc` decodes the real transaction XDR your wallet builds and returns a canned-but-valid response, including simulate → sign (with Freighter, pointed at a custom network matching `mock-rpc`'s passphrase) → submit → confirm.

**Known limitations of the mocks** (see `docker/mock-rpc/server.js` and `docker/mock-api/server.js` for exactly what's implemented):

- `mock-rpc` doesn't execute real contract logic or persist ledger state across restarts — it returns fixed/generated data keyed off which contract method was called, not the actual on-chain rules (e.g. it won't really enforce "only the admin can withdraw fees").
- `mock-api` responses are static fixtures; nothing you write through it is actually persisted.
- This compose stack builds and serves the frontend with `next build && next start` (production mode), not `next dev` — there's no hot-reloading. If you're actively editing frontend code, run `docker compose up mock-rpc mock-api` for just the mocks, then `npm run dev` locally with `.env.local` pointed at `http://localhost:8000` / `http://localhost:4000`; that gives you the credential-free mocks with normal hot-reload.

For anything that depends on real contract behavior or a real backend (integration testing before a release, verifying an actual Soroban migration), fall back to the manual setup below.

---

## Prerequisites

| Tool                         | Version / Requirement                                            | Check                            |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| **Node.js**                  | 24.x (matches CI — use `nvm use` if you have nvm)                | `node --version`                 |
| **npm**                      | 10.x or later (bundled with Node)                                | `npm --version`                  |
| **Rust** (stable)            | 1.70+                                                            | `rustc --version`                |
| **wasm32 target**            | `wasm32-unknown-unknown`                                         | `rustup target list --installed` |
| **Stellar CLI**              | Latest (`stellar --version` ≥ 22.0)                              | `stellar --version`              |
| **Freighter** (browser ext.) | [Freighter Wallet](https://www.freighter.app/) in Chrome/Firefox | Check extensions list            |
| **Git**                      | Any recent version                                               | `git --version`                  |

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

The project pins its Node.js version in `.nvmrc` (currently `24`). If you use [nvm](https://github.com/nvm-sh/nvm), run `nvm use` in the project root to switch to the pinned version automatically. If you don't have that version installed yet, run `nvm install` instead — it will read `.nvmrc` and install the correct version for you.

```bash
cd scout-off-frontend
# Switch to (or install) the pinned Node version from .nvmrc:
nvm use        # or: nvm install
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

| Variable                    | Value                                       |
| --------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_NETWORK`       | `testnet`                                   |
| `NEXT_PUBLIC_HORIZON_URL`   | `https://horizon-testnet.stellar.org`       |
| `NEXT_PUBLIC_SOROBAN_RPC`   | `https://soroban-testnet.stellar.org`       |
| `NEXT_PUBLIC_API_URL`       | `http://localhost:4000`                     |
| `NEXT_PUBLIC_CONTRACT_ID`   | _Leave blank for now; fill in after step 6_ |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | Your testnet wallet public key              |
| `PINATA_API_KEY`            | _Optional for local dev (IPFS uploads)_     |
| `PINATA_SECRET`             | _Optional for local dev (IPFS uploads)_     |
| `STELLAR_SECRET_KEY`        | Your testnet wallet secret key              |
| `NEXT_PUBLIC_APP_URL`       | `http://localhost:3000`                     |

Validate that all expected variables are declared:

```bash
node scripts/validate-env.js
```

Expected output: `✓ All N env vars declared in .env.example`

**SEP-10 origin allow-list:** `SEP10_ALLOWED_ORIGINS` can be left blank for local dev — `app/api/auth/sep10/route.ts` falls back to `http://<NEXT_PUBLIC_DOMAIN>` (default `http://localhost:3000`) when `NODE_ENV !== 'production'`. It **must** be set before deploying to any non-local environment: a comma-separated list of full origins allowed to call the SEP-10 POST endpoint, e.g. `SEP10_ALLOWED_ORIGINS=https://scoutoff.app,https://www.scoutoff.app`. In production, if this (and `NEXT_PUBLIC_BASE_URL`, honored as a convenience single-origin entry) are both unset, the route fails closed with `403` rather than trusting the request's own `Host` header.

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

### 8. Start the backend API

The frontend expects a backend API at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). This lives in `server/` in this same repo — see `server/README.md` for details. Start it in a separate terminal:

```bash
cd server
npm install
cp .env.example .env
npm start              # or `npm run dev` for auto-restart on file changes
```

The frontend will function without it for read-only operations; write operations (player registration, milestone approval, referrals) require the API for off-chain data. Off-chain, non-blockchain state (referral codes today; chat history and player/scout comments next, per the architecture diagram above) lives here — `server/README.md` documents the pattern to follow when adding the next such feature.

If you don't have the backend running, you can still browse the UI and interact with the contract directly via the Stellar SDK calls in the frontend hooks.

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
