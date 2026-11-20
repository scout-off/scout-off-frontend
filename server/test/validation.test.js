const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Schema validation (issue #1714): every route with a body, params, or
// query rejects malformed input with the shared 400 shape — never a 500.

const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-backend-test-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;
process.env.BACKEND_SERVICE_TOKEN = 'test-service-token';

const createApp = require('../dist/app');
const { isValidStellarAddress } = require('../dist/schemas/common');

const VALID = 'GAFQHU6AJVT4SWCB4L2BQQ6LDERANZKUBWKEWMD4ZI57TPTFVWSWYYEX';
// Same address with the last character changed: well-formed, bad checksum.
const BAD_CHECKSUM = VALID.slice(0, -1) + 'A';

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

async function send(method, pathname, body, rawBody) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-service-token',
      'X-Wallet': VALID,
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json() };
}

function assertValidationError(res, expectedPath) {
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  assert.ok(Array.isArray(res.body.error.details));
  if (expectedPath) {
    assert.ok(
      res.body.error.details.some((d) => d.path === expectedPath),
      `expected a detail for ${expectedPath}, got ${JSON.stringify(res.body.error.details)}`,
    );
  }
}

test('isValidStellarAddress checks the StrKey checksum', () => {
  assert.equal(isValidStellarAddress(VALID), true);
  assert.equal(isValidStellarAddress(BAD_CHECKSUM), false);
  assert.equal(isValidStellarAddress('GABC'), false);
  assert.equal(isValidStellarAddress(`S${VALID.slice(1)}`), false);
});

const cases = [
  [
    'POST',
    '/academies',
    { name: 'A', ownerWallet: BAD_CHECKSUM, createdBy: VALID },
    'body.ownerWallet',
  ],
  [
    'POST',
    '/academies',
    { name: '', ownerWallet: VALID, createdBy: VALID },
    'body.name',
  ],
  [
    'POST',
    '/academies',
    { name: 'A', ownerWallet: VALID, createdBy: VALID, extra: 1 },
    'body',
  ],
  [
    'POST',
    '/academies/some-id/members',
    { wallet: 'nope', addedBy: VALID },
    'body.wallet',
  ],
  ['PATCH', '/academies/some-id/quorum', { quorum: 0 }, 'body.quorum'],
  ['PATCH', '/academies/some-id/quorum', { quorum: '2' }, 'body.quorum'],
  ['GET', '/academies/wallet/not-a-wallet', undefined, 'params.wallet'],
  ['GET', '/academies/owner/not-a-wallet', undefined, 'params.wallet'],
  [
    'DELETE',
    '/academies/some-id/members/not-a-wallet',
    undefined,
    'params.wallet',
  ],
  [
    'POST',
    '/milestone-submissions',
    {
      playerId: 'p',
      description: 'd',
      validatorWallet: VALID,
      submittedBy: VALID,
      evidenceUrl: 'not a url',
    },
    'body.evidenceUrl',
  ],
  [
    'PATCH',
    '/milestone-submissions/some-id',
    { status: 'pending' },
    'body.status',
  ],
  [
    'PATCH',
    '/milestone-submissions/some-id',
    { status: 'approved', txHash: 'xyz' },
    'body.txHash',
  ],
  [
    'GET',
    `/milestone-submissions/validator/${VALID}?status=bogus`,
    undefined,
    'query.status',
  ],
  [
    'GET',
    '/milestone-submissions/validator/not-a-wallet',
    undefined,
    'params.wallet',
  ],
  ['POST', '/referrals/generate', { scoutWallet: 'GABC' }, 'body.scoutWallet'],
  ['POST', '/referrals/redeem', { code: 'SCOUT-ABCDEF' }, 'body.usedBy'],
  ['GET', '/referrals/scout/not-a-wallet', undefined, 'params.wallet'],
  ['GET', '/referrals/count/not-a-wallet', undefined, 'params.wallet'],
  ['POST', '/sponsorship/waitlist', { email: 'x@y.co', unknown: true }, 'body'],
  [
    'GET',
    '/users/me/sponsorship-waitlist?email=nope',
    undefined,
    'query.email',
  ],
  ['DELETE', '/users/me/sponsorship-waitlist', { email: 42 }, 'body.email'],
];

for (const [method, pathname, body, expectedPath] of cases) {
  test(`${method} ${pathname} rejects ${JSON.stringify(body ?? 'params')}`, async () => {
    assertValidationError(await send(method, pathname, body), expectedPath);
  });
}

test('a non-object body is a 400, not a 500', async () => {
  assertValidationError(await send('POST', '/academies', ['array']));
});

test('malformed JSON is a 400, not a 500', async () => {
  assertValidationError(
    await send('POST', '/referrals/redeem', undefined, '{"code":'),
    'body',
  );
});
