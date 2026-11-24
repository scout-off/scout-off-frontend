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
const updateSubmissionStatus = db.prepare(
  `UPDATE milestone_submissions
   SET status = @status, decided_at = @decidedAt, tx_hash = @txHash
   WHERE id = @id`,
);

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
  createSubmission,
  listForValidator,
  decideSubmission,
};
