const { systemLogger, errorFields } = require('../logger');
const { getClientIp } = require('../clientIp');

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verifies a Cloudflare Turnstile token on unauthenticated public endpoints.
 *
 * When TURNSTILE_SECRET_KEY is unset (local dev / tests), verification is
 * skipped entirely — same "leave blank to disable" convention the rest of
 * this project uses for optional third-party integrations.
 */
async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return next();
  }

  const token = req.body?.turnstileToken;
  if (typeof token !== 'string' || token.trim().length === 0) {
    return res.status(400).json({
      error:
        'Bot-protection challenge is required. Please complete the challenge and try again.',
    });
  }

  try {
    const params = new URLSearchParams({ secret, response: token });
    // #1775: Express's trusted req.ip, never the raw X-Forwarded-For header.
    const ip = getClientIp(req);
    if (ip !== 'unknown') params.set('remoteip', ip);

    const verifyRes = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const result = await verifyRes.json();

    if (!result.success) {
      return res.status(400).json({
        error: 'Bot-protection challenge failed. Please refresh and try again.',
      });
    }

    return next();
  } catch (err) {
    const log = req.log;
    const reason = err instanceof Error ? err.message : String(err);
    if (log) log.error('Turnstile verification request failed', { reason });
    else systemLogger.error('turnstile verification failed', errorFields(err));
    return res.status(502).json({
      error: 'Unable to verify bot-protection challenge. Please try again.',
    });
  }
}

module.exports = verifyTurnstile;
