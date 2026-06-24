import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const env = process.env.NODE_ENV;

if (SENTRY_DSN && env !== 'test' && env !== 'development') {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: env === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      return scrubWalletAddresses(event);
    },
  });
}

const STELLAR_ADDRESS_RE = /\bG[A-Z2-7]{55}\b/g;

function scrubWalletAddresses(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const serialized = JSON.stringify(event);
  const scrubbed = serialized.replace(STELLAR_ADDRESS_RE, '[wallet_address]');
  return JSON.parse(scrubbed) as Sentry.ErrorEvent;
}
