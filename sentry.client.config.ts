import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from './lib/sentryScrub';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const env = process.env.NODE_ENV;

// Disable Sentry in test and development
if (SENTRY_DSN && env !== 'test' && env !== 'development') {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: env === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}
