import type { RequestLogger } from '../logger';

// Properties the middleware attaches to every request.
declare global {
  namespace Express {
    interface Request {
      /** Request-scoped logger (middleware/requestLogger.ts). */
      log?: RequestLogger;
      /** Wallet verified by the Next server (routes/users.ts requireService). */
      wallet?: string;
    }
  }
}

export {};
