const express = require('express');
const referralService = require('../referralService');
const verifyTurnstile = require('../middleware/turnstile');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// POST /referrals/generate
// Body: { scoutWallet: string, turnstileToken?: string }
//
// Unauthenticated — a connected wallet address costs nothing to obtain, so
// this endpoint is gated behind a Turnstile challenge to deter bulk/bot
// code generation (see issue #626).
router.post('/generate', verifyTurnstile, (req, res) => {
  const { scoutWallet } = req.body ?? {};
  if (!isNonEmptyString(scoutWallet)) {
    return res.status(400).json({ error: 'scoutWallet is required' });
  }

  const referral = referralService.generateCode(scoutWallet);
  return res.status(201).json(referral);
});

// GET /referrals/scout/:wallet
router.get('/scout/:wallet', (req, res) => {
  const codes = referralService.getCodesByScout(req.params.wallet);
  return res.json(codes);
});

// GET /referrals/count/:wallet
router.get('/count/:wallet', (req, res) => {
  const wallet = req.params.wallet;
  const codes = referralService.getCodesByScout(wallet);
  const successfulReferrals = referralService.getReferralCount(wallet);
  return res.json({ totalCodes: codes.length, successfulReferrals });
});

// GET /referrals/overview
router.get('/overview', (req, res) => {
  return res.json(referralService.getReferralOverview());
});

// GET /referrals/all
router.get('/all', (req, res) => {
  return res.json(referralService.getAllCodes());
});

// POST /referrals/redeem
// Body: { code: string, usedBy: string }
router.post('/redeem', (req, res) => {
  const { code, usedBy } = req.body ?? {};
  if (!isNonEmptyString(code) || !isNonEmptyString(usedBy)) {
    return res.status(400).json({ error: 'code and usedBy are required' });
  }

  const ok = referralService.redeemCode(code, usedBy);
  if (!ok) {
    return res.status(404).json({ error: 'Invalid or already redeemed code' });
  }

  return res.json({ success: true });
});

module.exports = router;
