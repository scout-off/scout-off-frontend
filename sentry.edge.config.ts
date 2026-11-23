import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const env = process.env.NODE_ENV;

if (SENTRY_DSN && env !== 'test' && env !== 'development') {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: env === 'production' ? 0.1 : 1.0,
  });
}
