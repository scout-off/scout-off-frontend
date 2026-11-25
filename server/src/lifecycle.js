/**
 * Graceful shutdown for the Express backend (#1772).
 *
 * On SIGTERM/SIGINT: stop accepting connections, let in-flight requests
 * finish, then close the rate-limit Redis client and the SQLite database.
 * Bounded by SHUTDOWN_TIMEOUT_MS: when it passes, remaining sockets are
 * destroyed and the process exits 1. A second signal during shutdown forces
 * an immediate exit 1.
 *
 * Everything is injected so tests can drive it without real signals or
 * process.exit.
 */

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

function shutdownTimeoutMs(env = process.env) {
  const parsed = Number.parseInt(env.SHUTDOWN_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SHUTDOWN_TIMEOUT_MS;
}

/**
 * @param {object} deps
 * @param {import('http').Server} deps.server
 * @param {Array<{ name: string, close: () => unknown }>} deps.resources closed in order after the server
 * @param {{ info: Function, warn: Function, error: Function }} deps.logger
 * @param {number} [deps.timeoutMs]
 * @param {(code: number) => void} deps.exit
 */
function createShutdown({
  server,
  resources = [],
  logger,
  timeoutMs = shutdownTimeoutMs(),
  exit,
}) {
  let shuttingDown = false;

  // Keep-alive clients must not reuse a socket that is about to close.
  server.on('request', (_req, res) => {
    if (shuttingDown && !res.headersSent) res.setHeader('Connection', 'close');
  });

  async function shutdown(signal) {
    if (shuttingDown) {
      logger.warn('second shutdown signal, forcing exit', { signal });
      exit(1);
      return;
    }
    shuttingDown = true;
    logger.info('shutdown started', { signal, timeoutMs });

    let timedOut = false;
    const closed = new Promise((resolve) => {
      server.close(() => resolve());
      // Idle keep-alive sockets would otherwise hold close() open.
      if (typeof server.closeIdleConnections === 'function')
        server.closeIdleConnections();
    });
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        logger.warn('shutdown deadline passed, closing remaining connections', {
          timeoutMs,
        });
        if (typeof server.closeAllConnections === 'function')
          server.closeAllConnections();
        resolve();
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    });

    await Promise.race([closed, deadline]);
    clearTimeout(timer);
    logger.info('http server closed', { timedOut });

    let failed = false;
    for (const resource of resources) {
      try {
        await resource.close();
        logger.info('resource closed', { resource: resource.name });
      } catch (err) {
        failed = true;
        logger.error('failed to close resource', {
          resource: resource.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const code = timedOut || failed ? 1 : 0;
    logger.info('shutdown complete', { exitCode: code });
    exit(code);
  }

  return { shutdown, isShuttingDown: () => shuttingDown };
}

/** Registers `shutdown` for SIGTERM and SIGINT. */
function registerShutdownSignals(shutdown, proc = process) {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    proc.on(signal, () => {
      shutdown(signal);
    });
  }
}

module.exports = {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  shutdownTimeoutMs,
  createShutdown,
  registerShutdownSignals,
};
