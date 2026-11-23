/**
 * Milestone submissions API helpers (issue #1516, issues #567/#568).
 *
 * Off-chain queue of milestone claims awaiting validator review.
 * See server/src/db.js for the schema.
 */
import { backendClient as api } from './playersApi';
import type { MilestoneSubmission } from '@/types';

export const fetchPendingMilestoneSubmissions = (
  validatorWallet: string,
): Promise<MilestoneSubmission[]> =>
  api
    .get(
      `/milestone-submissions/validator/${encodeURIComponent(validatorWallet)}`,
      {
        params: { status: 'pending' },
      },
    )
    .then((r) => r.data);

export const decideMilestoneSubmission = (
  id: string,
  status: 'approved' | 'rejected',
  txHash?: string | null,
): Promise<MilestoneSubmission> =>
  api
    .patch(`/milestone-submissions/${encodeURIComponent(id)}`, {
      status,
      txHash,
    })
    .then((r) => r.data);

export const createMilestoneSubmission = (payload: {
  playerId: string;
  playerName?: string;
  description: string;
  evidenceUrl?: string;
  validatorWallet: string;
  submittedBy: string;
}): Promise<MilestoneSubmission> =>
  api.post('/milestone-submissions', payload).then((r) => r.data);
