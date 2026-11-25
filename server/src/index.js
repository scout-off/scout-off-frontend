const createApp = require('./app');
const { systemLogger } = require('./logger');

const PORT = process.env.PORT ?? 4000;

const app = createApp();
const server = app.listen(PORT, () => {
  systemLogger.info('server listening', { port: Number(PORT) });
});

// Drop requests that take longer than this to arrive in full (slowloris).
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);

// Issue #1772: shut down gracefully on SIGTERM/SIGINT (deploys, scale-down).
// Lives here, not in createApp(), so tests that build the app are unaffected.
const db = require('./db');
const { closeRateLimitStore } = require('./middleware/security');
const { createShutdown, registerShutdownSignals } = require('./lifecycle');

const { shutdown } = createShutdown({
  server,
  resources: [
    { name: 'rate-limit redis', close: closeRateLimitStore },
    { name: 'sqlite', close: () => db.close() },
  ],
  logger: systemLogger,
  exit: (code) => process.exit(code),
});
registerShutdownSignals(shutdown);
