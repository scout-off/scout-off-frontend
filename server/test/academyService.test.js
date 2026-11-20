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

const academyService = require('../dist/academyService');

test.after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test('createAcademy registers the owner wallet as the first member', () => {
  const academy = academyService.createAcademy(
    'FC Sahel',
    'GB67MEK3WC4BGE53PJRZBETL7JOZGICUOR5D635QQMF5Y6EP5SN32S5X',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  assert.equal(academy.name, 'FC Sahel');
  assert.equal(
    academy.ownerWallet,
    'GB67MEK3WC4BGE53PJRZBETL7JOZGICUOR5D635QQMF5Y6EP5SN32S5X',
  );
  assert.equal(academy.members.length, 1);
  assert.equal(
    academy.members[0].wallet,
    'GB67MEK3WC4BGE53PJRZBETL7JOZGICUOR5D635QQMF5Y6EP5SN32S5X',
  );
  assert.equal(
    academy.members[0].addedBy,
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );
});

test('addMember adds an additional signer under the same academy', () => {
  const academy = academyService.createAcademy(
    'FC Coastal',
    'GCWIFACGNYH4RRZR34KPSHYPJDE2QSR5H7J56IMZ7PEOHFIQW5N7FJSU',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );
  const updated = academyService.addMember(
    academy.id,
    'GCA77BBZSLMUSQFPUOVKDPZKV2DKE6OIQV7STUXYEGMXOUBYGBVZWIH2',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  assert.equal(updated.members.length, 2);
  assert.ok(
    updated.members.some(
      (m) =>
        m.wallet === 'GCA77BBZSLMUSQFPUOVKDPZKV2DKE6OIQV7STUXYEGMXOUBYGBVZWIH2',
    ),
  );
});

test('addMember is idempotent for a wallet already in the same academy', () => {
  const academy = academyService.createAcademy(
    'FC Idempotent',
    'GBSVGPCNPDHYF4KIZUKRUWBHBENVWAAJYIKKZIQJFRI7JPIBLCGWYIHN',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );
  academyService.addMember(
    academy.id,
    'GBH3NFNBA2HK5KLTCYEXAGG5LXY7NWDEWBWHWVEJ3VI33CTWGMVN2IYY',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );
  const again = academyService.addMember(
    academy.id,
    'GBH3NFNBA2HK5KLTCYEXAGG5LXY7NWDEWBWHWVEJ3VI33CTWGMVN2IYY',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  assert.equal(
    again.members.filter(
      (m) =>
        m.wallet === 'GBH3NFNBA2HK5KLTCYEXAGG5LXY7NWDEWBWHWVEJ3VI33CTWGMVN2IYY',
    ).length,
    1,
  );
});

test('addMember rejects a wallet already assigned to a different academy', () => {
  const academyA = academyService.createAcademy(
    'FC A',
    'GAWWT45TGXPWAIDETNLHJPLKQDTQ45LQJJTKOIYHTUAVEO35WQGMJYJ7',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );
  academyService.createAcademy(
    'FC B',
    'GB3QD274O22Y4BFKFOW5W7OR6OIRHUSC73SJZC63OQXJUEFMHNXVEUF2',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  assert.throws(
    () =>
      academyService.addMember(
        academyA.id,
        'GB3QD274O22Y4BFKFOW5W7OR6OIRHUSC73SJZC63OQXJUEFMHNXVEUF2',
        'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
      ),
    academyService.WalletAlreadyAssignedError,
  );
});

test('addMember throws AcademyNotFoundError for an unknown academy id', () => {
  assert.throws(
    () =>
      academyService.addMember(
        'does-not-exist',
        'GBDWN46VW2MTWQCJQXMZRSEHMS4CXVA6MHTASEPILCW7XYMQNNSB2TRX',
        'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
      ),
    academyService.AcademyNotFoundError,
  );
});

test('removeMember removes a signer and returns true; false when absent', () => {
  const academy = academyService.createAcademy(
    'FC Remove',
    'GDLZP3AOKXGJDXW2T2EINRDM5FKCLI65S6HV567JIRG43XY4WMIONKGW',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );
  academyService.addMember(
    academy.id,
    'GBDBWNYGCMRDPT22ES3KHIGXGSUJXAFPV2K3WZMRHVLU6RUWHKHEDN2D',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  assert.equal(
    academyService.removeMember(
      academy.id,
      'GBDBWNYGCMRDPT22ES3KHIGXGSUJXAFPV2K3WZMRHVLU6RUWHKHEDN2D',
    ),
    true,
  );
  assert.equal(
    academyService.removeMember(
      academy.id,
      'GBDBWNYGCMRDPT22ES3KHIGXGSUJXAFPV2K3WZMRHVLU6RUWHKHEDN2D',
    ),
    false,
  );

  const updated = academyService.getAcademy(academy.id);
  assert.ok(
    !updated.members.some(
      (m) =>
        m.wallet === 'GBDBWNYGCMRDPT22ES3KHIGXGSUJXAFPV2K3WZMRHVLU6RUWHKHEDN2D',
    ),
  );
});

test('getAcademyForWallet finds the academy a wallet is registered under', () => {
  const academy = academyService.createAcademy(
    'FC Lookup',
    'GAHOZE2BH54XVDLSHJSS62JLRYUUX3CMEXJF5AW6DUS3TZOOHBHH4O7N',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  const found = academyService.getAcademyForWallet(
    'GAHOZE2BH54XVDLSHJSS62JLRYUUX3CMEXJF5AW6DUS3TZOOHBHH4O7N',
  );
  assert.equal(found.id, academy.id);

  assert.equal(
    academyService.getAcademyForWallet(
      'GD25U44IFMOTUCGANFGEYC7J3N6UY6R22WAFQXUEZ52KYUSLCAHAQ6QX',
    ),
    null,
  );
});

test('listAcademies returns every academy with its members', () => {
  const before = academyService.listAcademies().length;
  academyService.createAcademy(
    'FC ListMe',
    'GAY3GTAHMPNLXES6ZRE3LY6ICPIFEQG6AAVQ7GDEHDC5Z47NA4ANLNGT',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  assert.equal(academyService.listAcademies().length, before + 1);
});

// issue #1173 — scoped academy-owner admin role
test('listAcademiesByOwnerWallet finds academies owned by a wallet', () => {
  const academy = academyService.createAcademy(
    'FC OwnerLookup',
    'GAZAELZX6PMRDKDDFZJEJGSHTRTUSNF4NTTJEMO7D4RHSTGMRCCCT6NB',
    'GAAIDLPOUGHDNDIZCWH7I243QT5ILOBZUKL2NFX25SU65HAEZSAVCYP3',
  );

  const found = academyService.listAcademiesByOwnerWallet(
    'GAZAELZX6PMRDKDDFZJEJGSHTRTUSNF4NTTJEMO7D4RHSTGMRCCCT6NB',
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].id, academy.id);

  assert.deepEqual(
    academyService.listAcademiesByOwnerWallet(
      'GD25U44IFMOTUCGANFGEYC7J3N6UY6R22WAFQXUEZ52KYUSLCAHAQ6QX',
    ),
    [],
  );
});
