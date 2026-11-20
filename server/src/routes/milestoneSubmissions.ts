import express from 'express';
import * as milestoneSubmissionService from '../milestoneSubmissionService';
import { validate } from '../middleware/validate';
import {
  createMilestoneSubmissionBody,
  decideMilestoneSubmissionBody,
  listSubmissionsQuery,
  submissionIdParams,
  walletParams,
} from '../schemas';
import type {
  CreateMilestoneSubmissionBody,
  DecideMilestoneSubmissionBody,
  MilestoneSubmissionStatus,
} from '../types/api';

const router = express.Router();

// POST /milestone-submissions
// Body: { playerId, playerName?, description, evidenceUrl?, validatorWallet, submittedBy }
router.post(
  '/',
  validate({ body: createMilestoneSubmissionBody }),
  (req, res) => {
    const submission = milestoneSubmissionService.createSubmission(
      req.body as CreateMilestoneSubmissionBody,
    );
    return res.status(201).json(submission);
  },
);

// GET /milestone-submissions/validator/:wallet?status=pending
// Public read — matches the validator-stats/academy-lookup pattern above;
// the validator dashboard queries this without any auth of its own.
router.get(
  '/validator/:wallet',
  validate({ params: walletParams, query: listSubmissionsQuery }),
  (req, res) => {
    const status = req.query.status as MilestoneSubmissionStatus;
    return res.json(
      milestoneSubmissionService.listForValidator(req.params.wallet, status),
    );
  },
);

// PATCH /milestone-submissions/:id
// Body: { status: 'approved' | 'rejected', txHash?: string }
router.patch(
  '/:id',
  validate({ params: submissionIdParams, body: decideMilestoneSubmissionBody }),
  (req, res) => {
    const { status, txHash } = req.body as DecideMilestoneSubmissionBody;

    try {
      const submission = milestoneSubmissionService.decideSubmission(
        req.params.id,
        status,
        txHash,
      );
      return res.json(submission);
    } catch (err) {
      if (err instanceof milestoneSubmissionService.SubmissionNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  },
);

export default router;
