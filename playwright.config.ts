import { defineConfig, devices } from '@playwright/test';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import * as os from 'os';
import * as path from 'path';
import { E2E_ADMIN_ADDRESS } from './e2e/fixtures/admin';

const PORT = process.env.E2E_PORT ?? '3100';
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * An environment variable that is set but *empty* counts as unset here.
 * GitHub Actions exports the whole `env:` block at workflow level, where
 * several of these are declared as empty placeholders (see
 * .github/workflows/ci.yml) — with a plain `??` those empty strings would
 * win over the fallbacks below and the dev server would boot with e.g. an
 * empty SEP10_SERVER_KEY.
 */
function envOr(value: string | undefined, fallback: string): string {
  return value ? value : fallback;
}

// Each run gets its own session registry (lib/sessionStore.ts) instead of
// appending to data/sessions.db, so specs that count or revoke sessions
// (e2e/session-lifecycle.spec.ts) start from a known-empty table rather than
// inheriting rows left behind by a previous run. `reuseExistingServer` below
// means a dev server you already have running keeps its own DB — set
// SESSIONS_DB_PATH yourself if you need to pin it.
const SESSIONS_DB_PATH =
  process.env.SESSIONS_DB_PATH ??
  path.join(os.tmpdir(), `scout-e2e-sessions-${process.pid}-${Date.now()}.db`);

// The SEP-10 signer and the domain it authenticates. Both have to be declared
// twice: once under their server-only names (read by app/api/auth/sep10/route.ts
// when it builds the challenge) and once under the NEXT_PUBLIC_ names the
// browser-side validator (lib/sep10Validation.ts) insists on, because the
// client must not trust the challenge for either value. Without the public
// halves the app fetches a valid challenge and then refuses to sign it
// ("Expected server account is not configured") — every connect in the suite
// fails at the wallet popup, which is exactly what happened before #1299 wired
// these up.
const SEP10_SERVER_KEY = envOr(
  process.env.SEP10_SERVER_KEY,
  'SC3DZLMLSQROXMTXYPX6YLQPOWFNDAIZIH6APZTXOSSUAU2Q43E7UKZL',
);
const SEP10_HOME_DOMAIN = envOr(
  process.env.SEP10_HOME_DOMAIN,
  `127.0.0.1:${PORT}`,
);

// Contract reads are answered by e2e/fixtures/mock-contract.ts, but the SDK
// still needs a syntactically valid contract address to build the call —
// CI's workflow-level env sets the placeholder `ci-placeholder`, which isn't.
const E2E_CONTRACT_ID = StrKey.isValidContract(
  process.env.NEXT_PUBLIC_CONTRACT_ID ?? '',
)
  ? process.env.NEXT_PUBLIC_CONTRACT_ID!
  : StrKey.encodeContract(Buffer.alloc(32, 7));

// A dedicated port + explicit NEXT_PUBLIC_BASE_URL/NEXT_PUBLIC_DOMAIN keep the
// dev server's SEP-10 origin check (app/api/auth/sep10/route.ts) happy —
// it rejects requests whose Origin header doesn't match exactly.
export default defineConfig({
  testDir: './e2e',
  // Storybook visual-regression specs (Issue #539) run under their own
  // config (playwright.visual.config.ts, `npm run test:visual`) against a
  // Storybook server instead of the Next.js dev server this config boots.
  testIgnore: '**/visual/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  // Real network calls (SEP-10 challenge/verify, wallet signing round-trip)
  // plus Next dev-mode's on-demand route compilation need more than the
  // 5s default on a cold run.
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_BASE_URL: BASE_URL,
      NEXT_PUBLIC_DOMAIN: `127.0.0.1:${PORT}`,
      NEXT_PUBLIC_NETWORK: 'testnet',
      NEXT_PUBLIC_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      NEXT_PUBLIC_SOROBAN_RPC: 'https://soroban-testnet.stellar.org',
      // SEP-10 challenges are built/verified locally (no network call), so
      // any keypair works here — see e2e/README.md.
      SEP10_SERVER_KEY,
      SEP10_HOME_DOMAIN,
      // Public half of SEP10_SERVER_KEY, derived rather than pasted so the two
      // can't drift apart (see .env.example: the browser value must match
      // Keypair.fromSecret(SEP10_SERVER_KEY).publicKey()).
      NEXT_PUBLIC_SEP10_SERVER_ACCOUNT: envOr(
        process.env.NEXT_PUBLIC_SEP10_SERVER_ACCOUNT,
        Keypair.fromSecret(SEP10_SERVER_KEY).publicKey(),
      ),
      NEXT_PUBLIC_SEP10_HOME_DOMAIN: envOr(
        process.env.NEXT_PUBLIC_SEP10_HOME_DOMAIN,
        SEP10_HOME_DOMAIN,
      ),
      // lib/session.ts throws without a SESSION_SECRET, and
      // app/api/auth/sep10/route.ts turns that into a 401 — so every connect
      // attempt in the suite failed until #1299 set it here. Throwaway value:
      // it only ever signs cookies for this throwaway dev server.
      SESSION_SECRET: envOr(
        process.env.SESSION_SECRET,
        'e2e-session-secret-do-not-use-in-production',
      ),
      SESSIONS_DB_PATH,
      // The admin specs sign in as e2e/fixtures/admin.ts's wallet; the /admin
      // guard and admin API routes compare against this. CI's workflow-level
      // env declares it empty, so a plain spread would leave nobody admin.
      NEXT_PUBLIC_ADMIN_ADDRESS: E2E_ADMIN_ADDRESS,
      NEXT_PUBLIC_CONTRACT_ID: E2E_CONTRACT_ID,
      // Enables test-only routes such as POST /api/migration/test-advance,
      // which 404 unless this is set (see lib/envManifest.json).
      E2E_TEST_ROUTES: '1',
      // Lets specs give each test its own client IP via X-Forwarded-For so
      // strict per-IP limits (e.g. 3 migration requests/hour) don't carry
      // over between tests sharing this one dev server.
      TRUSTED_PROXY_COUNT: '1',
      // Passed through only when the runner asks for it. Unset means the real
      // 20-minute access-token TTL, so the rest of the suite exercises
      // production-like lifetimes; e2e/session-lifecycle.spec.ts needs a short
      // one to observe a token actually lapse (see e2e/README.md).
      ...(process.env.ACCESS_TOKEN_TTL_SEC
        ? { ACCESS_TOKEN_TTL_SEC: process.env.ACCESS_TOKEN_TTL_SEC }
        : {}),
    },
  },
});
