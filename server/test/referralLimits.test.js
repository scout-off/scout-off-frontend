const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolated database, as in referrals.test.js.
const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-referral-limits-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;
process.env.RATE_LIMIT_TURNSTILE_MAX = '1000';

const createApp = require('../src/app');
const referralService = require('../src/referralService');

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
  try {
    fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
  } catch {
    // The SQLite file can stay locked on Windows; the OS cleans temp dirs.
  }
});

async function post(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function withCap(cap, fn) {
  const previous = process.env.REFERRAL_MAX_UNREDEEMED;
  process.env.REFERRAL_MAX_UNREDEEMED = String(cap);
  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) delete process.env.REFERRAL_MAX_UNREDEEMED;
    else process.env.REFERRAL_MAX_UNREDEEMED = previous;
  });
}

// ── #1774: cap on unredeemed codes per wallet ──────────────────────────────

test('the default cap is 10 and REFERRAL_MAX_UNREDEEMED overrides it', () => {
  const previous = process.env.REFERRAL_MAX_UNREDEEMED;
  delete process.env.REFERRAL_MAX_UNREDEEMED;
  assert.equal(referralService.maxUnredeemedCodesPerWallet(), 10);
  process.env.REFERRAL_MAX_UNREDEEMED = '3';
  assert.equal(referralService.maxUnredeemedCodesPerWallet(), 3);
  process.env.REFERRAL_MAX_UNREDEEMED = 'nonsense';
  assert.equal(referralService.maxUnredeemedCodesPerWallet(), 10);
  if (previous === undefined) delete process.env.REFERRAL_MAX_UNREDEEMED;
  else process.env.REFERRAL_MAX_UNREDEEMED = previous;
});

test('generateCode stops exactly at the cap and inserts nothing past it', () =>
  withCap(3, () => {
    const wallet = 'GLIMIT_LOOP';
    for (let i = 0; i < 3; i += 1) referralService.generateCode(wallet);
    assert.throws(
      () => referralService.generateCode(wallet),
      (err) =>
        err instanceof referralService.ReferralLimitError &&
        err.code === 'REFERRAL_LIMIT_REACHED' &&
        err.limit === 3,
    );
    assert.equal(referralService.getCodesByScout(wallet).length, 3);
  }));

test('POST /referrals/generate returns 409 REFERRAL_LIMIT_REACHED at the cap', () =>
  withCap(2, async () => {
    const wallet = 'GLIMIT_HTTP';
    assert.equal(
      (await post('/referrals/generate', { scoutWallet: wallet })).status,
      201,
    );
    assert.equal(
      (await post('/referrals/generate', { scoutWallet: wallet })).status,
      201,
    );
    const res = await post('/referrals/generate', { scoutWallet: wallet });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, {
      error: 'Referral code limit reached',
      code: 'REFERRAL_LIMIT_REACHED',
      limit: 2,
    });
    assert.equal(referralService.getCodesByScout(wallet).length, 2);
  }));

test('redeemed codes do not count toward the cap', () =>
  withCap(1, async () => {
    const wallet = 'GLIMIT_REDEEM';
    const first = referralService.generateCode(wallet);
    assert.throws(
      () => referralService.generateCode(wallet),
      referralService.ReferralLimitError,
    );
    assert.equal(referralService.redeemCode(first.code, 'GSOMEONE_ELSE'), true);
    const next = referralService.generateCode(wallet);
    assert.match(next.code, /^SCOUT-/);
  }));

// ── #1777: case- and whitespace-insensitive redemption ─────────────────────

test('redeeming ignores case and surrounding whitespace', async () => {
  for (const variant of [
    (c) => c.toLowerCase(),
    (c) => `  ${c} `,
    (c) => c[0] + c.slice(1).toLowerCase(),
  ]) {
    const { code } = referralService.generateCode(`GCASE_${Math.random()}`);
    const res = await post('/referrals/redeem', {
      code: variant(code),
      usedBy: 'GPLAYER_CASE',
    });
    assert.equal(res.status, 200, `variant ${variant(code)} failed`);
    assert.deepEqual(res.body, { success: true });
  }
});

test('a whitespace-only code is still a 400', async () => {
  const res = await post('/referrals/redeem', {
    code: '   ',
    usedBy: 'GPLAYER',
  });
  assert.equal(res.status, 400);
});

test('self-redemption and double redemption are still rejected after normalizing', async () => {
  const { code } = referralService.generateCode('GSELF_SCOUT');
  const self = await post('/referrals/redeem', {
    code: code.toLowerCase(),
    usedBy: 'GSELF_SCOUT',
  });
  assert.equal(self.status, 404);

  assert.equal(
    (await post('/referrals/redeem', { code: ` ${code}`, usedBy: 'GPLAYER_1' }))
      .status,
    200,
  );
  const again = await post('/referrals/redeem', {
    code: code.toLowerCase(),
    usedBy: 'GPLAYER_2',
  });
  assert.equal(again.status, 404);
});
