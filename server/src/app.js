const express = require('express');
const {
  securityHeaders,
  corsMiddleware,
  rateLimiters,
} = require('./middleware/security');
const requestLogger = require('./middleware/requestLogger');
const { createRequestLogger } = require('./logger');
const { authenticate } = require('./middleware/authenticate');
const referralsRouter = require('./routes/referrals');
const academiesRouter = require('./routes/academies');
const sponsorshipRouter = require('./routes/sponsorship');
const milestoneSubmissionsRouter = require('./routes/milestoneSubmissions');
const usersRouter = require('./routes/users');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Number of reverse proxies in front of the app, so req.ip (and the rate
  // limiter's key) is the client's address rather than the proxy's.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));

  app.use(securityHeaders());
  app.use(corsMiddleware());
  // Ahead of express.json() so req.log exists even for requests that fail
  // to parse (a malformed body throws before any later middleware runs).
  app.use(requestLogger);
  app.use(rateLimiters());
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Off-chain data endpoints. `referrals` is the first migrated workload;
  // future off-chain features (chat history, comments — see the root
  // README architecture diagram) should follow the same pattern: a
  // dedicated service module + a router mounted here.
  //
  // Every router below is mounted behind `authenticate`, which verifies the
  // SEP-10 session token issued by the Next.js app and sets `req.wallet`.
  // Routers enforce per-route ownership/role checks on top of this.
  app.use('/referrals', authenticate, referralsRouter);
  app.use('/academies', authenticate, academiesRouter);
  app.use('/sponsorship', authenticate, sponsorshipRouter);
  app.use('/milestone-submissions', authenticate, milestoneSubmissionsRouter);
  app.use('/users', authenticate, usersRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    const log = req.log ?? createRequestLogger(req);
    log.error('Unhandled request error', {
      reason: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
