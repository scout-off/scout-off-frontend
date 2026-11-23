const express = require('express');
const milestoneSubmissionService = require('../milestoneSubmissionService');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const VALID_STATUSES = ['pending', 'approved', 'rejected'];

// POST /milestone-submissions
// Body: { playerId, playerName?, description, evidenceUrl?, validatorWallet, submittedBy }
router.post('/', (req, res) => {
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
    !isNonEmptyString(validatorWallet) ||
    !isNonEmptyString(submittedBy)
  ) {
    return res.status(400).json({
      error:
        'playerId, description, validatorWallet, and submittedBy are required',
    });
  }

  const submission = milestoneSubmissionService.createSubmission({
    playerId,
    playerName,
    description,
    evidenceUrl,
    validatorWallet,
    submittedBy,
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
router.patch('/:id', (req, res) => {
  const { status, txHash } = req.body ?? {};
  if (!VALID_STATUSES.includes(status) || status === 'pending') {
    return res
      .status(400)
      .json({ error: "status must be 'approved' or 'rejected'" });
  }

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
});

module.exports = router;
