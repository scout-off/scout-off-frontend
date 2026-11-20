import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import * as userDataService from '../userDataService';
import { validate } from '../middleware/validate';
import { waitlistEmailBody, waitlistEmailQuery } from '../schemas';

const router = express.Router();

/**
 * Service-credential auth (issue #1352). Until the backend has its own user
 * auth, only the Next server may call these routes: it sends
 * `Authorization: Bearer $BACKEND_SERVICE_TOKEN` plus the wallet it has
 * already verified from the session cookie in `X-Wallet`.
 */
function requireService(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.BACKEND_SERVICE_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'Service auth is not configured' });
  }
  const given = (req.get('authorization') ?? '').replace(/^Bearer /, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const wallet = req.get('x-wallet');
  if (!wallet) {
    return res.status(400).json({ error: 'X-Wallet header is required' });
  }
  req.wallet = wallet;
  next();
}

router.use(requireService);

// GET /users/me/export
router.get('/me/export', (req, res) => {
  res.json(userDataService.exportWalletData(req.wallet as string));
});

// DELETE /users/me
router.delete('/me', (req, res) => {
  const result = userDataService.deleteWalletData(req.wallet as string);
  req.log?.info('Deleted backend user data', result);
  res.json(result);
});

// GET /users/me/sponsorship-waitlist?email=... — caller has verified the email.
router.get(
  '/me/sponsorship-waitlist',
  validate({ query: waitlistEmailQuery }),
  (req, res) => {
    const email = req.query.email as string;
    res.json({ entry: userDataService.exportWaitlistEmail(email) });
  },
);

// DELETE /users/me/sponsorship-waitlist — body { email }; caller has verified the email.
router.delete(
  '/me/sponsorship-waitlist',
  validate({ body: waitlistEmailBody }),
  (req, res) => {
    const { email } = req.body as { email: string };
    res.json({ removed: userDataService.deleteWaitlistEmail(email) });
  },
);

export default router;
