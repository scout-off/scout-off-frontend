const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// db.js reads process.env.DB_PATH once, at require time, so point it at a
// fresh temp file before anything requires the app — this keeps every test
// run isolated from any real/dev database on disk.
const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-backend-test-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;
// This file calls the Turnstile-gated /referrals/generate more than the
// production per-minute cap (RATE_LIMIT_TURNSTILE_MAX, default 10) allows.
process.env.RATE_LIMIT_TURNSTILE_MAX = '1000';

const createApp = require('../dist/app');

let server;
let baseUrl;

test.before(async () => {
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

async function post(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  return { status: res.status, body: await res.json() };
}

test('GET /health returns ok', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('POST /referrals/generate creates a code owned by the given scout', async () => {
  const res = await post('/referrals/generate', {
    scoutWallet: 'GBCHFNOVSWKLQHOW3NRGGGQ4T6NMY7SNGG4RCTOON6JATI4DER2IPDRO',
  });
  assert.equal(res.status, 201);
  assert.match(res.body.code, /^SCOUT-[A-Z0-9]{6}$/);
  assert.equal(
    res.body.scoutWallet,
    'GBCHFNOVSWKLQHOW3NRGGGQ4T6NMY7SNGG4RCTOON6JATI4DER2IPDRO',
  );
  assert.equal(res.body.usedBy, null);
});

test('POST /referrals/generate requires scoutWallet', async () => {
  const res = await post('/referrals/generate', {});
  assert.equal(res.status, 400);
});

test("GET /referrals/scout/:wallet returns only that scout's codes", async () => {
  await post('/referrals/generate', {
    scoutWallet: 'GBHMN3A4KVSRVQSSVODIJ5NX6IHSWC27SZ3GQ4HGBE4Q4I3RL726GOCA',
  });
  await post('/referrals/generate', {
    scoutWallet: 'GBHMN3A4KVSRVQSSVODIJ5NX6IHSWC27SZ3GQ4HGBE4Q4I3RL726GOCA',
  });
  await post('/referrals/generate', {
    scoutWallet: 'GAGWCLDU446YRQWKMJOW63ZTVJXHIOMLBEI56UVUVU6GYBJUYFDIX6DB',
  });

  const res = await get(
    '/referrals/scout/GBHMN3A4KVSRVQSSVODIJ5NX6IHSWC27SZ3GQ4HGBE4Q4I3RL726GOCA',
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.ok(
    res.body.every(
      (c) =>
        c.scoutWallet ===
        'GBHMN3A4KVSRVQSSVODIJ5NX6IHSWC27SZ3GQ4HGBE4Q4I3RL726GOCA',
    ),
  );
});

test('full generate -> redeem -> count lifecycle', async () => {
  const generated = await post('/referrals/generate', {
    scoutWallet: 'GDEWVQVJ2HJA6ZMPODDQMYXP7HKJ4KSWLWAKI2ZPCIN4RWHVR3L3743C',
  });
  const code = generated.body.code;

  const countBefore = await get(
    '/referrals/count/GDEWVQVJ2HJA6ZMPODDQMYXP7HKJ4KSWLWAKI2ZPCIN4RWHVR3L3743C',
  );
  assert.equal(countBefore.body.totalCodes, 1);
  assert.equal(countBefore.body.successfulReferrals, 0);

  const redeemed = await post('/referrals/redeem', {
    code,
    usedBy: 'GBVEBJICULAJLXK4TM2FPNL7OVDQJ6262YFYK6PTHPBXYUEHFPVHTZYR',
  });
  assert.equal(redeemed.status, 200);
  assert.deepEqual(redeemed.body, { success: true });

  const countAfter = await get(
    '/referrals/count/GDEWVQVJ2HJA6ZMPODDQMYXP7HKJ4KSWLWAKI2ZPCIN4RWHVR3L3743C',
  );
  assert.equal(countAfter.body.successfulReferrals, 1);

  // Redeeming the same code again must fail — already used.
  const secondAttempt = await post('/referrals/redeem', {
    code,
    usedBy: 'GC4APO2H4U4FVDH7CE6XUP66U3VFN5WVBQUQY5AKEWE2JMJRJZZP7F3Y',
  });
  assert.equal(secondAttempt.status, 404);
});

test('POST /referrals/redeem returns 404 for an unknown code', async () => {
  const res = await post('/referrals/redeem', {
    code: 'SCOUT-NOPE99',
    usedBy: 'GA3LTL3AXJ2F2LDMWHQ7LOMR3DKFUA3VQYAHGDF5IGLJMQAR57YO57Y4',
  });
  assert.equal(res.status, 404);
});

test('POST /referrals/redeem requires code and usedBy', async () => {
  const res = await post('/referrals/redeem', { code: 'SCOUT-ABC123' });
  assert.equal(res.status, 400);
});

test('POST /referrals/redeem rejects self-redemption', async () => {
  const generated = await post('/referrals/generate', {
    scoutWallet: 'GCC7Z4OIZCEBO3MOYCLXOQEMTPHYCMW3VL7JHKO3OWWMZEC64NHCTSVH',
  });
  const code = generated.body.code;

  const res = await post('/referrals/redeem', {
    code,
    usedBy: 'GCC7Z4OIZCEBO3MOYCLXOQEMTPHYCMW3VL7JHKO3OWWMZEC64NHCTSVH',
  });
  assert.equal(res.status, 404);

  const codes = await get(
    '/referrals/scout/GCC7Z4OIZCEBO3MOYCLXOQEMTPHYCMW3VL7JHKO3OWWMZEC64NHCTSVH',
  );
  assert.equal(codes.body[0].usedBy, null);
});

test('GET /referrals/overview reports totals and top referrers', async () => {
  await post('/referrals/generate', {
    scoutWallet: 'GA4UFGTZKLIAYOFFPTHH45KC4XFZCO24QCKB7FA3TINLDUHZRRP54DWB',
  });
  const generated = await post('/referrals/generate', {
    scoutWallet: 'GA4UFGTZKLIAYOFFPTHH45KC4XFZCO24QCKB7FA3TINLDUHZRRP54DWB',
  });
  await post('/referrals/redeem', {
    code: generated.body.code,
    usedBy: 'GA4UMSOC7UPZWNOWM3R5CMAKSQPQDJRHY6W46C5ORLY2MC2TZUM6R4U3',
  });

  const res = await get('/referrals/overview');
  assert.equal(res.status, 200);
  assert.ok(res.body.totalCodes >= 2);
  assert.ok(res.body.totalSuccessfulReferrals >= 1);
  const entry = res.body.topReferrers.find(
    (r) =>
      r.scoutWallet ===
      'GA4UFGTZKLIAYOFFPTHH45KC4XFZCO24QCKB7FA3TINLDUHZRRP54DWB',
  );
  assert.deepEqual(entry, {
    scoutWallet: 'GA4UFGTZKLIAYOFFPTHH45KC4XFZCO24QCKB7FA3TINLDUHZRRP54DWB',
    totalCodes: 2,
    successfulReferrals: 1,
  });
});

test('GET /referrals/all returns every code across every scout', async () => {
  await post('/referrals/generate', {
    scoutWallet: 'GBQGD2744TBUJEBSL2ABNOSGAZ5CYSVS6VUUU76MSZ3A76HMY7YOJR6N',
  });
  await post('/referrals/generate', {
    scoutWallet: 'GAQN7FPGN6ZAQFZSNPU2SRBPA63BHVXYRLSTM3AEBOL6V5TEZOGK7URE',
  });

  const res = await get('/referrals/all');
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 2);
  assert.ok(
    res.body.some(
      (c) =>
        c.scoutWallet ===
        'GBQGD2744TBUJEBSL2ABNOSGAZ5CYSVS6VUUU76MSZ3A76HMY7YOJR6N',
    ),
  );
  assert.ok(
    res.body.some(
      (c) =>
        c.scoutWallet ===
        'GAQN7FPGN6ZAQFZSNPU2SRBPA63BHVXYRLSTM3AEBOL6V5TEZOGK7URE',
    ),
  );
});
