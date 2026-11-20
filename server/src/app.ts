import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import './types/express';
import {
  securityHeaders,
  corsMiddleware,
  rateLimiters,
} from './middleware/security';
import requestLogger from './middleware/requestLogger';
import { sendValidationError } from './middleware/validate';
import { createRequestLogger } from './logger';
import referralsRouter from './routes/referrals';
import academiesRouter from './routes/academies';
import sponsorshipRouter from './routes/sponsorship';
import milestoneSubmissionsRouter from './routes/milestoneSubmissions';
import usersRouter from './routes/users';

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
  app.use('/referrals', referralsRouter);
  app.use('/academies', academiesRouter);
  app.use('/sponsorship', sponsorshipRouter);
  app.use('/milestone-submissions', milestoneSubmissionsRouter);
  app.use('/users', usersRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(
    // eslint-disable-next-line no-unused-vars
    (err: unknown, req: Request, res: Response, next: NextFunction) => {
      const type = (err as { type?: string } | null)?.type;
      if (type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large' });
      }
      // Malformed JSON is a client error, not a 500 (issue #1714).
      if (type === 'entity.parse.failed') {
        return sendValidationError(res, [
          { path: 'body', message: 'Malformed JSON' },
        ]);
      }
      const log = req.log ?? createRequestLogger(req);
      log.error('Unhandled request error', {
        reason: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}

export = createApp;
