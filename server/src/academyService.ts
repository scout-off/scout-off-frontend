import crypto from 'crypto';
import db from './db';
import type { Academy, AcademyMember } from './types/api';

export class AcademyNotFoundError extends Error {}
export class WalletAlreadyAssignedError extends Error {}
export class QuorumOutOfRangeError extends Error {}

interface AcademyRow {
  id: string;
  name: string;
  owner_wallet: string;
  created_at: number;
  quorum: number | null;
}

interface MemberRow {
  wallet: string;
  academy_id: string;
  added_at: number;
  added_by: string;
}

const insertAcademy = db.prepare(
  `INSERT INTO academies (id, name, owner_wallet, created_at)
   VALUES (@id, @name, @ownerWallet, @createdAt)`,
);
const findAcademyById = db.prepare<[string], AcademyRow>(
  `SELECT * FROM academies WHERE id = ?`,
);
const listAcademiesStmt = db.prepare<[], AcademyRow>(
  `SELECT * FROM academies ORDER BY created_at DESC`,
);
const findAcademiesByOwnerWallet = db.prepare<[string], AcademyRow>(
  `SELECT * FROM academies WHERE owner_wallet = ? ORDER BY created_at DESC`,
);
const insertMember = db.prepare(
  `INSERT INTO academy_members (wallet, academy_id, added_at, added_by)
   VALUES (@wallet, @academyId, @addedAt, @addedBy)`,
);
const findMemberByWallet = db.prepare<[string], MemberRow>(
  `SELECT * FROM academy_members WHERE wallet = ?`,
);
const updateQuorumStmt = db.prepare(
  `UPDATE academies SET quorum = @quorum WHERE id = @id`,
);
const listMembersByAcademy = db.prepare<[string], MemberRow>(
  `SELECT * FROM academy_members WHERE academy_id = ? ORDER BY added_at ASC`,
);
const deleteMember = db.prepare(
  `DELETE FROM academy_members WHERE wallet = ? AND academy_id = ?`,
);

function toMember(row: MemberRow): AcademyMember {
  return {
    wallet: row.wallet,
    academyId: row.academy_id,
    addedAt: row.added_at,
    addedBy: row.added_by,
  };
}

function toAcademy(row: AcademyRow): Academy {
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

export function getAcademy(id: string): Academy | null {
  const row = findAcademyById.get(id);
  return row ? toAcademy(row) : null;
}

export function listAcademies(): Academy[] {
  return listAcademiesStmt.all().map(toAcademy);
}

/**
 * Adds `wallet` as a signer under `academyId`. Idempotent when the wallet is
 * already a member of the same academy; rejects (409-worthy) when the
 * wallet already belongs to a *different* academy, since a wallet maps to
 * at most one academy at a time.
 */
export function addMember(
  academyId: string,
  wallet: string,
  addedBy: string,
): Academy | null {
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
export function createAcademy(
  name: string,
  ownerWallet: string,
  createdBy: string,
): Academy | null {
  const id = crypto.randomUUID();
  insertAcademy.run({ id, name, ownerWallet, createdAt: Date.now() });
  addMember(id, ownerWallet, createdBy);
  return getAcademy(id);
}

/** Returns true if a row was removed. */
export function removeMember(academyId: string, wallet: string): boolean {
  return deleteMember.run(wallet, academyId).changes > 0;
}

/** Looks up which academy (if any) a wallet is a registered signer for. */
export function getAcademyForWallet(wallet: string): Academy | null {
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
export function listAcademiesByOwnerWallet(wallet: string): Academy[] {
  return findAcademiesByOwnerWallet.all(wallet).map(toAcademy);
}

/**
 * Sets (or, with `null`, clears) an academy's validator quorum — issue
 * #1185. Throws AcademyNotFoundError for an unknown id, and
 * QuorumOutOfRangeError when `quorum` exceeds the academy's member count.
 */
export function setAcademyQuorum(
  academyId: string,
  quorum: number | null,
): Academy | null {
  const academy = getAcademy(academyId);
  if (!academy) {
    throw new AcademyNotFoundError(`Academy ${academyId} not found`);
  }
  if (quorum !== null && quorum > academy.members.length) {
    throw new QuorumOutOfRangeError(
      `quorum must be between 1 and the member count (${academy.members.length})`,
    );
  }
  const { changes } = updateQuorumStmt.run({ id: academyId, quorum });
  if (changes === 0) {
    throw new AcademyNotFoundError(`Academy ${academyId} not found`);
  }
  return getAcademy(academyId);
}
