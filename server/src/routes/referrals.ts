import express from 'express';
import * as referralService from '../referralService';
import verifyTurnstile from '../middleware/turnstile';
import { validate } from '../middleware/validate';
import {
  generateReferralBody,
  redeemReferralBody,
  walletParams,
} from '../schemas';
import type { GenerateReferralBody, RedeemReferralBody } from '../types/api';

const router = express.Router();

// POST /referrals/generate
// Body: { scoutWallet: string, turnstileToken?: string }
//
// Unauthenticated — a connected wallet address costs nothing to obtain, so
// this endpoint is gated behind a Turnstile challenge to deter bulk/bot
// code generation (see issue #626).
router.post(
  '/generate',
  validate({ body: generateReferralBody }),
  verifyTurnstile,
  (req, res) => {
    const { scoutWallet } = req.body as GenerateReferralBody;
    const referral = referralService.generateCode(scoutWallet);
    return res.status(201).json(referral);
  },
);

// GET /referrals/scout/:wallet
router.get('/scout/:wallet', validate({ params: walletParams }), (req, res) => {
  const codes = referralService.getCodesByScout(req.params.wallet);
  return res.json(codes);
});

// GET /referrals/count/:wallet
router.get('/count/:wallet', validate({ params: walletParams }), (req, res) => {
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
router.post('/redeem', validate({ body: redeemReferralBody }), (req, res) => {
  const { code, usedBy } = req.body as RedeemReferralBody;

  const ok = referralService.redeemCode(code, usedBy);
  if (!ok) {
    return res.status(404).json({ error: 'Invalid or already redeemed code' });
  }

  return res.json({ success: true });
});

export default router;
