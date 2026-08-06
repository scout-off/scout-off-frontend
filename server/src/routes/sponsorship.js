const express = require('express');
const crypto = require('crypto');
const sponsorshipService = require('../sponsorshipService');
const verifyTurnstile = require('../middleware/turnstile');

const router = express.Router();

const ALLOWED_INTEREST_TYPES = ['fan', 'investor', 'sponsor'];

/** Very basic email regex — rejects obviously invalid, lets the DB enforce uniqueness. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Hash the submitter's IP so we can track abuse patterns without storing raw IPs.
 */
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// ---------------------------------------------------------------------------
// POST /sponsorship/waitlist
// ---------------------------------------------------------------------------

router.post('/waitlist', verifyTurnstile, (req, res) => {
  const { email, interestType } = req.body ?? {};

  // ── Validation ──────────────────────────────────────────────────────────
  if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) {
    return res
      .status(400)
      .json({ error: 'A valid email address is required.' });
  }

  const type = interestType ?? 'fan';
  if (!ALLOWED_INTEREST_TYPES.includes(type)) {
    return res.status(400).json({
      error: `interestType must be one of: ${ALLOWED_INTEREST_TYPES.join(', ')}`,
    });
  }

  // ── IP hash for abuse tracking ──────────────────────────────────────────
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown';

  // ── Persist ─────────────────────────────────────────────────────────────
  const signup = sponsorshipService.addSignup(
    email,
    type,
    Date.now(),
    hashIp(ip),
  );

  if (!signup) {
    // Duplicate email — return a friendly message rather than leaking
    // whether an address already exists.
    return res.status(409).json({
      message: 'You are already on the waitlist.',
    });
  }

  return res.status(201).json({
    message:
      "You're on the list! We'll notify you when fractionalized sponsorship launches.",
  });
});

// ---------------------------------------------------------------------------
// GET /sponsorship/waitlist  (admin-facing — not publicly linked)
// ---------------------------------------------------------------------------

router.get('/waitlist', (req, res) => {
  return res.json(sponsorshipService.getAllSignupsSafe());
});

module.exports = router;
