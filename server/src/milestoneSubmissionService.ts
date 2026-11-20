import crypto from 'crypto';
import db from './db';
import type {
  CreateMilestoneSubmissionBody,
  MilestoneSubmission,
  MilestoneSubmissionStatus,
} from './types/api';

export class SubmissionNotFoundError extends Error {}

interface SubmissionRow {
  id: string;
  player_id: string;
  player_name: string | null;
  description: string;
  evidence_url: string | null;
  validator_wallet: string;
  submitted_by: string;
  status: MilestoneSubmissionStatus;
  created_at: number;
  decided_at: number | null;
  tx_hash: string | null;
}

const insertSubmission = db.prepare(
  `INSERT INTO milestone_submissions
     (id, player_id, player_name, description, evidence_url, validator_wallet, submitted_by, status, created_at)
   VALUES (@id, @playerId, @playerName, @description, @evidenceUrl, @validatorWallet, @submittedBy, 'pending', @createdAt)`,
);
const findSubmissionById = db.prepare<[string], SubmissionRow>(
  `SELECT * FROM milestone_submissions WHERE id = ?`,
);
const listByValidatorAndStatus = db.prepare<[string, string], SubmissionRow>(
  `SELECT * FROM milestone_submissions
   WHERE validator_wallet = ? AND status = ?
   ORDER BY created_at ASC`,
);
const updateSubmissionStatus = db.prepare(
  `UPDATE milestone_submissions
   SET status = @status, decided_at = @decidedAt, tx_hash = @txHash
   WHERE id = @id`,
);

function toSubmission(row: SubmissionRow): MilestoneSubmission {
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
export function createSubmission({
  playerId,
  playerName,
  description,
  evidenceUrl,
  validatorWallet,
  submittedBy,
}: CreateMilestoneSubmissionBody): MilestoneSubmission {
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
  return toSubmission(findSubmissionById.get(id) as SubmissionRow);
}

/** Lists submissions for a validator, oldest first. Defaults to pending only. */
export function listForValidator(
  validatorWallet: string,
  status: MilestoneSubmissionStatus = 'pending',
): MilestoneSubmission[] {
  return listByValidatorAndStatus
    .all(validatorWallet, status)
    .map(toSubmission);
}

/**
 * Records the outcome of reviewing a submission (approved/rejected), along
 * with the on-chain transaction hash when one was produced.
 */
export function decideSubmission(
  id: string,
  status: MilestoneSubmissionStatus,
  txHash?: string,
): MilestoneSubmission {
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
  return toSubmission(findSubmissionById.get(id) as SubmissionRow);
}
