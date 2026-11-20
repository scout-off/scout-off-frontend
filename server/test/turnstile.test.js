const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-backend-turnstile-test-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;
process.env.TURNSTILE_SECRET_KEY = 'test-secret';

const createApp = require('../dist/app');

let server;
let baseUrl;
let originalFetch;

test.before(async () => {
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  originalFetch = global.fetch;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
  delete process.env.TURNSTILE_SECRET_KEY;
  global.fetch = originalFetch;
});

async function post(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('POST /referrals/generate rejects a missing turnstile token with a clear error', async () => {
  const res = await post('/referrals/generate', {
    scoutWallet: 'GCTG2P7DRCSYJN24HMJM2Z6NOWBQHTJNJIC57PVF65WNHCYX5Y56OB7R',
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /challenge/i);
});

test('POST /referrals/generate rejects a failed turnstile verification', async () => {
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('challenges.cloudflare.com')) {
      return new Response(JSON.stringify({ success: false }), { status: 200 });
    }
    return originalFetch(url, options);
  };

  const res = await post('/referrals/generate', {
    scoutWallet: 'GAT43VL3TKWDUTXQIK6EGO6UMR5YKZMIZKWM4TS7KYAWYY56PS7MERAN',
    turnstileToken: 'bad-token',
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /challenge failed/i);
});

test('POST /referrals/generate succeeds when turnstile verification passes', async () => {
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('challenges.cloudflare.com')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return originalFetch(url, options);
  };

  const res = await post('/referrals/generate', {
    scoutWallet: 'GDB3V2LHLQR5NDH4TUY3LKWIW2SQWFAT4JXM3GVUS5G4ED4PG6MC5GDB',
    turnstileToken: 'good-token',
  });
  assert.equal(res.status, 201);
  assert.equal(
    res.body.scoutWallet,
    'GDB3V2LHLQR5NDH4TUY3LKWIW2SQWFAT4JXM3GVUS5G4ED4PG6MC5GDB',
  );
});
