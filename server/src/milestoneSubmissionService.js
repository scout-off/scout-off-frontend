const crypto = require('crypto');
const db = require('./db');

class SubmissionNotFoundError extends Error {}

const insertSubmission = db.prepare(
  `INSERT INTO milestone_submissions
     (id, player_id, player_name, description, evidence_url, validator_wallet, submitted_by, status, created_at)
   VALUES (@id, @playerId, @playerName, @description, @evidenceUrl, @validatorWallet, @submittedBy, 'pending', @createdAt)`,
);
const findSubmissionById = db.prepare(
  `SELECT * FROM milestone_submissions WHERE id = ?`,
);
const listByValidatorAndStatus = db.prepare(
  `SELECT * FROM milestone_submissions
   WHERE validator_wallet = ? AND status = ?
   ORDER BY created_at ASC`,
);
const countByValidatorAndStatus = db.prepare(
  `SELECT COUNT(*) AS count FROM milestone_submissions
   WHERE validator_wallet = ? AND status = ?`,
);
const listPageAsc = db.prepare(
  `SELECT * FROM milestone_submissions
   WHERE validator_wallet = ? AND status = ?
     AND (created_at > ? OR (created_at = ? AND id > ?))
   ORDER BY created_at ASC, id ASC
   LIMIT ?`,
);
const listPageDesc = db.prepare(
  `SELECT * FROM milestone_submissions
   WHERE validator_wallet = ? AND status = ?
     AND (created_at < ? OR (created_at = ? AND id < ?))
   ORDER BY created_at DESC, id DESC
   LIMIT ?`,
);
const updateSubmissionStatus = db.prepare(
  `UPDATE milestone_submissions
   SET status = @status, decided_at = @decidedAt, tx_hash = @txHash
   WHERE id = @id`,
);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toSubmission(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name,
    description: row.description,
    evidenceUrl: row.evidence_url,
    validatorWallet: row.validator_wallet,
    submittedBy: row.submitted_by,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    txHash: row.tx_hash,
  };
}

/**
 * Encodes an opaque pagination cursor from the stable `(created_at, id)`
 * ordering key. Base64 keeps it opaque to clients.
 */
function encodeCursor(createdAt, id) {
  return Buffer.from(`${createdAt},${id}`, 'utf8').toString('base64');
}

/** Decodes a cursor produced by {@link encodeCursor}; returns null if invalid. */
function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0) return null;
  let raw;
  try {
    raw = Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const sep = raw.indexOf(',');
  if (sep <= 0) return null;
  const createdAt = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (!Number.isFinite(createdAt) || id.length === 0) return null;
  return { createdAt, id };
}

/** Clamps a requested page size into the supported [1, MAX_LIMIT] range. */
function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

/** Queues a milestone submission for a validator to review. */
function createSubmission({
  playerId,
  playerName,
  description,
  evidenceUrl,
  validatorWallet,
  submittedBy,
}) {
  const id = crypto.randomUUID();
  insertSubmission.run({
    id,
    playerId,
    playerName: playerName ?? null,
    description,
    evidenceUrl: evidenceUrl ?? null,
    validatorWallet,
    submittedBy,
    createdAt: Date.now(),
  });
  return toSubmission(findSubmissionById.get(id));
}

/** Lists submissions for a validator, oldest first. Defaults to pending only. */
function listForValidator(validatorWallet, status = 'pending') {
  return listByValidatorAndStatus
    .all(validatorWallet, status)
    .map(toSubmission);
}

/** Cheap total count of a validator's submissions in a given status. */
function countForValidator(validatorWallet, status = 'pending') {
  const row = countByValidatorAndStatus.get(validatorWallet, status);
  return row ? row.count : 0;
}

/**
 * Cursor-paginated listing for a validator. Ordering is stable on
 * `(created_at, id)` for both directions, so rows inserted between page
 * fetches never shift or duplicate already-returned items.
 *
 * @param {string} validatorWallet
 * @param {{ status?: string, limit?: number, cursor?: string, sort?: 'asc'|'desc' }} options
 * @returns {{ items: object[], nextCursor: string|null }}
 */
function listPageForValidator(validatorWallet, options = {}) {
  const status = options.status ?? 'pending';
  const limit = normalizeLimit(options.limit);
  const sort = options.sort === 'desc' ? 'desc' : 'asc';
  const decoded = decodeCursor(options.cursor);

  // Fetch one extra row to detect whether another page exists.
  const fetchLimit = limit + 1;
  let rows;
  if (sort === 'desc') {
    const anchorCreatedAt = decoded
      ? decoded.createdAt
      : Number.MAX_SAFE_INTEGER;
    const anchorId = decoded ? decoded.id : '\uffff';
    rows = listPageDesc.all(
      validatorWallet,
      status,
      anchorCreatedAt,
      anchorCreatedAt,
      anchorId,
      fetchLimit,
    );
  } else {
    const anchorCreatedAt = decoded ? decoded.createdAt : -1;
    const anchorId = decoded ? decoded.id : '';
    rows = listPageAsc.all(
      validatorWallet,
      status,
      anchorCreatedAt,
      anchorCreatedAt,
      anchorId,
      fetchLimit,
    );
  }

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.created_at, last.id) : null;

  return { items: pageRows.map(toSubmission), nextCursor };
}

/**
 * Records the outcome of reviewing a submission (approved/rejected), along
 * with the on-chain transaction hash when one was produced.
 */
function decideSubmission(id, status, txHash) {
  const existing = findSubmissionById.get(id);
  if (!existing) {
    throw new SubmissionNotFoundError(`Submission ${id} not found`);
  }
  updateSubmissionStatus.run({
    id,
    status,
    decidedAt: Date.now(),
    txHash: txHash ?? null,
  });
  return toSubmission(findSubmissionById.get(id));
}

module.exports = {
  SubmissionNotFoundError,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  createSubmission,
  listForValidator,
  countForValidator,
  listPageForValidator,
  encodeCursor,
  decodeCursor,
  decideSubmission,
};
