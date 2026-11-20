/**
 * Lighthouse CI puppeteerScript: signs a test wallet in before LHCI audits
 * the wallet-gated dashboards (/player, /scout, /validator).
 *
 * Nothing test-only ships in the app itself. This script runs in the LHCI
 * process, mints an access token with the same HMAC format as
 * lib/session.ts#createSessionToken, and registers its `sid` directly in the
 * server's SQLite session store (SESSIONS_DB_PATH). It only works when it
 * shares a CI-only SESSION_SECRET and session DB with the server under test,
 * and it refuses to run unless explicitly enabled outside production.
 */
const { createHmac, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Throws unless test auth is explicitly enabled outside production. */
function assertTestAuthAllowed(env = process.env) {
  if (env.LHCI_TEST_AUTH !== '1') {
    throw new Error('LHCI test auth is disabled (set LHCI_TEST_AUTH=1).');
  }
  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error('LHCI test auth must never run against production.');
  }
  if (!env.SESSION_SECRET || !env.SESSIONS_DB_PATH) {
    throw new Error(
      'LHCI test auth needs SESSION_SECRET and SESSIONS_DB_PATH.',
    );
  }
}

// Test-only Stellar account; never funded on any network.
const TEST_WALLET = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
const AUTH_PATHS = /\/en\/(player|scout|validator)(\/|$)/;

/** Mints an access token and registers its session row. */
function mintSession(env = process.env) {
  assertTestAuthAllowed(env);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60;
  const sid = randomUUID();
  const payload = Buffer.from(
    JSON.stringify({
      sub: TEST_WALLET,
      typ: 'access',
      iat: now,
      exp,
      jti: randomUUID(),
      sid,
      kid: '0',
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(env.SESSIONS_DB_PATH), { recursive: true });
  const db = new Database(env.SESSIONS_DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, wallet TEXT NOT NULL, created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER, user_agent TEXT)`);
  db.prepare(
    `INSERT INTO sessions (id, wallet, created_at, expires_at, last_seen_at, revoked_at, user_agent)
     VALUES (?, ?, ?, ?, ?, NULL, 'lhci')`,
  ).run(sid, TEST_WALLET, now * 1000, exp * 1000, now * 1000);
  db.close();

  return `${payload}.${signature}`;
}

let token;

module.exports = async (browser, context) => {
  if (!AUTH_PATHS.test(context.url)) return;
  token = token || mintSession();
  const { origin } = new URL(context.url);
  const page = await browser.newPage();
  await page.setCookie({
    name: 'session',
    value: token,
    url: origin,
    httpOnly: true,
    sameSite: 'Lax',
  });
  await page.goto(`${origin}/en`, { waitUntil: 'domcontentloaded' });
  // WalletContext restores from this hint and reconciles it with the
  // cookie; 'albedo' is the provider that needs no browser extension.
  await page.evaluate(
    (value) => localStorage.setItem('wallet_session', value),
    JSON.stringify({
      publicKey: TEST_WALLET,
      provider: 'albedo',
      networkType: 'testnet',
    }),
  );
  await page.close();
};

module.exports.assertTestAuthAllowed = assertTestAuthAllowed;
module.exports.mintSession = mintSession;
