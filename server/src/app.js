const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const { createRequestLogger } = require('./logger');
const referralsRouter = require('./routes/referrals');
const academiesRouter = require('./routes/academies');
const sponsorshipRouter = require('./routes/sponsorship');
const milestoneSubmissionsRouter = require('./routes/milestoneSubmissions');
const usersRouter = require('./routes/users');

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    }),
  );
  // Ahead of express.json() so req.log exists even for requests that fail
  // to parse (a malformed body throws before any later middleware runs).
  app.use(requestLogger);
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Off-chain data endpoints. `referrals` is the first migrated workload;
  // future off-chain features (chat history, comments — see the root
  // README architecture diagram) should follow the same pattern: a
  // dedicated service module + a router mounted here.
  app.use('/referrals', referralsRouter);
  app.use('/academies', academiesRouter);
  app.use('/sponsorship', sponsorshipRouter);
  app.use('/milestone-submissions', milestoneSubmissionsRouter);
  app.use('/users', usersRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const log = req.log ?? createRequestLogger(req);
    log.error('Unhandled request error', {
      reason: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
