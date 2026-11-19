const express = require('express');
const milestoneSubmissionService = require('../milestoneSubmissionService');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const VALID_STATUSES = ['pending', 'approved', 'rejected'];

// POST /milestone-submissions
// Body: { playerId, playerName?, description, evidenceUrl?, validatorWallet }
// submittedBy is derived from the authenticated session, never the body.
router.post('/', authenticate, (req, res) => {
  const {
    playerId,
    playerName,
    description,
    evidenceUrl,
    validatorWallet,
    submittedBy,
  } = req.body ?? {};

  if (
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(description) ||
    !isNonEmptyString(validatorWallet)
  ) {
    return res.status(400).json({
      error: 'playerId, description, and validatorWallet are required',
    });
  }

  if (isNonEmptyString(submittedBy) && submittedBy !== req.wallet) {
    return res
      .status(403)
      .json({ error: 'submittedBy must match the authenticated wallet' });
  }

  const submission = milestoneSubmissionService.createSubmission({
    playerId,
    playerName,
    description,
    evidenceUrl,
    validatorWallet,
    submittedBy: req.wallet,
  });
  return res.status(201).json(submission);
});

// GET /milestone-submissions/validator/:wallet?status=pending
// Public read — matches the validator-stats/academy-lookup pattern above;
// the validator dashboard queries this without any auth of its own.
router.get('/validator/:wallet', (req, res) => {
  const status =
    typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (!VALID_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  return res.json(
    milestoneSubmissionService.listForValidator(req.params.wallet, status),
  );
});

// PATCH /milestone-submissions/:id
// Body: { status: 'approved' | 'rejected', txHash?: string }
// Only the assigned validator may decide a submission.
router.patch('/:id', authenticate, (req, res) => {
  const { status, txHash } = req.body ?? {};
  if (!VALID_STATUSES.includes(status) || status === 'pending') {
    return res
      .status(400)
      .json({ error: "status must be 'approved' or 'rejected'" });
  }

  try {
    const existing = milestoneSubmissionService.getSubmission(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (existing.validatorWallet !== req.wallet) {
      return res
        .status(403)
        .json({ error: 'Only the assigned validator may decide this submission' });
    }

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
});

module.exports = router;
