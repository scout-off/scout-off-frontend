const express = require('express');
const milestoneSubmissionService = require('../milestoneSubmissionService');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const VALID_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_SORTS = ['oldest', 'newest'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw) {
  if (raw === undefined) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_LIMIT);
}

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

// GET /milestone-submissions/validator/:wallet/count?status=pending
// Cheap total so the dashboard badge stays accurate without loading rows.
router.get('/validator/:wallet/count', (req, res) => {
  const status =
    typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (!VALID_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  return res.json({
    count: milestoneSubmissionService.countForValidator(req.params.wallet, status),
  });
});

// GET /milestone-submissions/validator/:wallet?status=pending&limit=50&cursor=...&sort=oldest
// Public read — matches the validator-stats/academy-lookup pattern above;
// the validator dashboard queries this without any auth of its own.
//
// Cursor pagination: returns `{ items, nextCursor }`. The legacy flat-array
// response is still served when `version` is omitted or `1`, for one release.
router.get('/validator/:wallet', (req, res) => {
  const status =
    typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (!VALID_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'oldest';
  if (!VALID_SORTS.includes(sort)) {
    return res
      .status(400)
      .json({ error: `sort must be one of ${VALID_SORTS.join(', ')}` });
  }

  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    return res.status(400).json({ error: 'limit must be a positive integer' });
  }

  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const version = req.query.version;
  const paginated = version === '2';

  let page;
  try {
    page = milestoneSubmissionService.listForValidator(req.params.wallet, status, {
      limit,
      cursor,
      sort,
    });
  } catch (err) {
    if (err instanceof milestoneSubmissionService.InvalidCursorError) {
      return res.status(400).json({ error: 'invalid cursor' });
    }
    throw err;
  }

  if (!paginated) {
    // Legacy shape: flat array of every matching submission.
    return res.json(page.items);
  }
  return res.json({ items: page.items, nextCursor: page.nextCursor });
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
