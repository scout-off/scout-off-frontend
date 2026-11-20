const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-backend-test-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;

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

async function del(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

async function patch(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('POST /academies creates an academy with the owner as first member', async () => {
  const res = await post('/academies', {
    name: 'FC Sahel',
    ownerWallet: 'GB67MEK3WC4BGE53PJRZBETL7JOZGICUOR5D635QQMF5Y6EP5SN32S5X',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'FC Sahel');
  assert.equal(res.body.members.length, 1);
  assert.equal(
    res.body.members[0].wallet,
    'GB67MEK3WC4BGE53PJRZBETL7JOZGICUOR5D635QQMF5Y6EP5SN32S5X',
  );
});

test('POST /academies requires name, ownerWallet, and createdBy', async () => {
  const res = await post('/academies', { name: 'Missing fields' });
  assert.equal(res.status, 400);
});

test('GET /academies lists created academies', async () => {
  await post('/academies', {
    name: 'FC List',
    ownerWallet: 'GDNLXHBVHR3T4P5KJS3L7A72M2H3ZJUD6KIS2UFHRS35HDA5VCGEAJEQ',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  const res = await get('/academies');
  assert.equal(res.status, 200);
  assert.ok(res.body.some((a) => a.name === 'FC List'));
});

test('POST /academies/:id/members adds a signer wallet', async () => {
  const created = await post('/academies', {
    name: 'FC Members',
    ownerWallet: 'GAFWJFIJHZKPXABVXDOYC33FJQWMFQAUPWPZV2WPYMJ674HAMPHQ3YHS',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  const res = await post(`/academies/${created.body.id}/members`, {
    wallet: 'GCA77BBZSLMUSQFPUOVKDPZKV2DKE6OIQV7STUXYEGMXOUBYGBVZWIH2',
    addedBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.members.length, 2);
});

test('POST /academies/:id/members 404s for an unknown academy', async () => {
  const res = await post('/academies/does-not-exist/members', {
    wallet: 'GBH3NFNBA2HK5KLTCYEXAGG5LXY7NWDEWBWHWVEJ3VI33CTWGMVN2IYY',
    addedBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });
  assert.equal(res.status, 404);
});

test('POST /academies/:id/members 409s when the wallet belongs to another academy', async () => {
  const a = await post('/academies', {
    name: 'FC A',
    ownerWallet: 'GBIMUT45HWYXONUIBXKET5LGUL7O7VBSXUGIUN3Q4VPLKZ2X2CG3TDF3',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });
  const b = await post('/academies', {
    name: 'FC B',
    ownerWallet: 'GDIU2BD7WGCT36B6ULEIIFMAWEMGY5AYYR7QA7QQ734VP26SBR7BORCU',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  const res = await post(`/academies/${a.body.id}/members`, {
    wallet: 'GDIU2BD7WGCT36B6ULEIIFMAWEMGY5AYYR7QA7QQ734VP26SBR7BORCU',
    addedBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  assert.equal(res.status, 409);
  assert.ok(b.body.id); // keep b referenced
});

test('GET /academies/wallet/:wallet finds the owning academy', async () => {
  const created = await post('/academies', {
    name: 'FC Wallet Lookup',
    ownerWallet: 'GAOGIDVV5Z5YFJVB4VJEQI3V2KFBV45UKSFT7VU5UVJ7TIHO6ASR5AZ7',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  const res = await get(
    '/academies/wallet/GAOGIDVV5Z5YFJVB4VJEQI3V2KFBV45UKSFT7VU5UVJ7TIHO6ASR5AZ7',
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.id, created.body.id);
});

test('GET /academies/wallet/:wallet 404s for a wallet in no academy', async () => {
  const res = await get(
    '/academies/wallet/GD25U44IFMOTUCGANFGEYC7J3N6UY6R22WAFQXUEZ52KYUSLCAHAQ6QX',
  );
  assert.equal(res.status, 404);
});

test('DELETE /academies/:id/members/:wallet removes a signer', async () => {
  const created = await post('/academies', {
    name: 'FC Delete',
    ownerWallet: 'GBDJHOIPH3NRDQN6O56PW5CWQ26S6UFNUQ44VWGYWFHB3GE3Q27DEUXX',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });
  await post(`/academies/${created.body.id}/members`, {
    wallet: 'GBWDSM4DJSG2EVEUP6MTPOKUDTHSM6OSNXR74YTNFAQX4KEXEBNRJ5YV',
    addedBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  const res = await del(
    `/academies/${created.body.id}/members/GBWDSM4DJSG2EVEUP6MTPOKUDTHSM6OSNXR74YTNFAQX4KEXEBNRJ5YV`,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true });

  const lookup = await get(
    '/academies/wallet/GBWDSM4DJSG2EVEUP6MTPOKUDTHSM6OSNXR74YTNFAQX4KEXEBNRJ5YV',
  );
  assert.equal(lookup.status, 404);
});

test('DELETE /academies/:id/members/:wallet 404s when membership does not exist', async () => {
  const res = await del(
    '/academies/does-not-exist/members/GD25U44IFMOTUCGANFGEYC7J3N6UY6R22WAFQXUEZ52KYUSLCAHAQ6QX',
  );
  assert.equal(res.status, 404);
});

// ── Milestone approval quorum (issue #1185) ──────────────────────────────────

const QUORUM_MEMBER =
  'GBQH5ETP5VNCOQOKA3J7SQICRXNVT7HVDCAINK5F6QYUVFD2A3ACEFWY';

test('PATCH /academies/:id/quorum sets a quorum', async () => {
  const created = await post('/academies', {
    name: 'FC Quorum Route',
    ownerWallet: 'GDPO2XCOIFUGBAOOZL3Q7EMQHZBTKJRZ52I6SEY6BMJ2MF2JL5LFT7RI',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });
  await post(`/academies/${created.body.id}/members`, {
    wallet: QUORUM_MEMBER,
    addedBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  const res = await patch(`/academies/${created.body.id}/quorum`, {
    quorum: 2,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.quorum, 2);
});

test('PATCH /academies/:id/quorum clears a quorum with null', async () => {
  const created = await post('/academies', {
    name: 'FC Quorum Clear',
    ownerWallet: 'GC7WJO56H7RQLHHMO6C4RHAHLSYRKVQ6LN6VQPLMJYDMIMCWWTFFOECB',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });
  await patch(`/academies/${created.body.id}/quorum`, { quorum: 1 });

  const res = await patch(`/academies/${created.body.id}/quorum`, {
    quorum: null,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.quorum, null);
});

test('PATCH /academies/:id/quorum rejects a non-positive-integer quorum', async () => {
  const created = await post('/academies', {
    name: 'FC Quorum Invalid',
    ownerWallet: 'GAOBC5GHNOCA747S2HDQBIRLC5PLLXBHMNRHESY5U43ON5IOIFKYX5IT',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });

  for (const bad of [0, -1, 1.5, 'two']) {
    const res = await patch(`/academies/${created.body.id}/quorum`, {
      quorum: bad,
    });
    assert.equal(res.status, 400, `expected 400 for quorum=${bad}`);
  }
});

test('PATCH /academies/:id/quorum 404s for an unknown academy', async () => {
  const res = await patch('/academies/does-not-exist/quorum', { quorum: 2 });
  assert.equal(res.status, 404);
});

test('PATCH /academies/:id/quorum rejects a quorum above the member count', async () => {
  const created = await post('/academies', {
    name: 'FC Quorum Bounds',
    ownerWallet: 'GB5HVS3YJ377LML4L4RMGKP6G5RATQC65CMM26MVK2SJ5JFNKS57I5CL',
    createdBy: 'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  });
  const res = await patch(`/academies/${created.body.id}/quorum`, {
    quorum: 2,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  assert.equal(res.body.error.details[0].path, 'body.quorum');
});
