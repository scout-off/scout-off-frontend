import express from 'express';
import crypto from 'crypto';
import * as sponsorshipService from '../sponsorshipService';
import verifyTurnstile from '../middleware/turnstile';
import { validate } from '../middleware/validate';
import { sponsorshipWaitlistBody } from '../schemas';
import type { SponsorshipWaitlistBody } from '../types/api';

const router = express.Router();

/**
 * Hash the submitter's IP so we can track abuse patterns without storing raw IPs.
 */
function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// ---------------------------------------------------------------------------
// POST /sponsorship/waitlist
// ---------------------------------------------------------------------------

router.post(
  '/waitlist',
  validate({ body: sponsorshipWaitlistBody }),
  verifyTurnstile,
  (req, res) => {
    const { email, interestType } = req.body as SponsorshipWaitlistBody;
    const type = interestType ?? 'fan';

    // ── IP hash for abuse tracking ────────────────────────────────────────
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : undefined) ??
      req.socket?.remoteAddress ??
      'unknown';

    // ── Persist ───────────────────────────────────────────────────────────
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
  },
);

// ---------------------------------------------------------------------------
// GET /sponsorship/waitlist  (admin-facing — not publicly linked)
// ---------------------------------------------------------------------------

router.get('/waitlist', (req, res) => {
  return res.json(sponsorshipService.getAllSignupsSafe());
});

export default router;
