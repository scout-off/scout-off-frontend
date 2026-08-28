const crypto = require('crypto');
const db = require('./db');

class AcademyNotFoundError extends Error {}
class WalletAlreadyAssignedError extends Error {}

const insertAcademy = db.prepare(
  `INSERT INTO academies (id, name, owner_wallet, created_at)
   VALUES (@id, @name, @ownerWallet, @createdAt)`,
);
const findAcademyById = db.prepare(`SELECT * FROM academies WHERE id = ?`);
const listAcademiesStmt = db.prepare(
  `SELECT * FROM academies ORDER BY created_at DESC`,
);
const findAcademiesByOwnerWallet = db.prepare(
  `SELECT * FROM academies WHERE owner_wallet = ? ORDER BY created_at DESC`,
);
const insertMember = db.prepare(
  `INSERT INTO academy_members (wallet, academy_id, added_at, added_by)
   VALUES (@wallet, @academyId, @addedAt, @addedBy)`,
);
const findMemberByWallet = db.prepare(
  `SELECT * FROM academy_members WHERE wallet = ?`,
);
const updateQuorumStmt = db.prepare(
  `UPDATE academies SET quorum = @quorum WHERE id = @id`,
);
const listMembersByAcademy = db.prepare(
  `SELECT * FROM academy_members WHERE academy_id = ? ORDER BY added_at ASC`,
);
const deleteMember = db.prepare(
  `DELETE FROM academy_members WHERE wallet = ? AND academy_id = ?`,
);

function toMember(row) {
  return {
    wallet: row.wallet,
    academyId: row.academy_id,
    addedAt: row.added_at,
    addedBy: row.added_by,
  };
}

function toAcademy(row) {
  return {
    id: row.id,
    name: row.name,
    ownerWallet: row.owner_wallet,
    createdAt: row.created_at,
    members: listMembersByAcademy.all(row.id).map(toMember),
    // NULL (unconfigured) is the default and must behave identically to
    // today — see issue #1185.
    quorum: row.quorum ?? null,
  };
}

function getAcademy(id) {
  const row = findAcademyById.get(id);
  return row ? toAcademy(row) : null;
}

function listAcademies() {
  return listAcademiesStmt.all().map(toAcademy);
}

/**
 * Adds `wallet` as a signer under `academyId`. Idempotent when the wallet is
 * already a member of the same academy; rejects (409-worthy) when the
 * wallet already belongs to a *different* academy, since a wallet maps to
 * at most one academy at a time.
 */
function addMember(academyId, wallet, addedBy) {
  if (!findAcademyById.get(academyId)) {
    throw new AcademyNotFoundError(`Academy ${academyId} not found`);
  }

  const existing = findMemberByWallet.get(wallet);
  if (existing) {
    if (existing.academy_id === academyId) return getAcademy(academyId);
    throw new WalletAlreadyAssignedError(
      `Wallet already belongs to academy ${existing.academy_id}`,
    );
  }

  insertMember.run({ wallet, academyId, addedAt: Date.now(), addedBy });
  return getAcademy(academyId);
}

/**
 * Creates a new academy and registers its owner wallet as the first member.
 */
function createAcademy(name, ownerWallet, createdBy) {
  const id = crypto.randomUUID();
  insertAcademy.run({ id, name, ownerWallet, createdAt: Date.now() });
  addMember(id, ownerWallet, createdBy);
  return getAcademy(id);
}

/** Returns true if a row was removed. */
function removeMember(academyId, wallet) {
  return deleteMember.run(wallet, academyId).changes > 0;
}

/** Looks up which academy (if any) a wallet is a registered signer for. */
function getAcademyForWallet(wallet) {
  const member = findMemberByWallet.get(wallet);
  return member ? getAcademy(member.academy_id) : null;
}

/**
 * Looks up every academy `wallet` is recorded as the `ownerWallet` of (see
 * issue #1173 — the scoped academy-owner admin role). Nothing today
 * prevents one wallet from being recorded as owner on more than one
 * academy, so this returns an array rather than assuming at most one, even
 * though the common case is a single academy.
 */
function listAcademiesByOwnerWallet(wallet) {
  return findAcademiesByOwnerWallet.all(wallet).map(toAcademy);
}

module.exports = {
  AcademyNotFoundError,
  WalletAlreadyAssignedError,
  createAcademy,
  getAcademy,
  listAcademies,
  addMember,
  removeMember,
  getAcademyForWallet,
  listAcademiesByOwnerWallet,
};
