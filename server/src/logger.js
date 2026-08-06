const crypto = require('crypto');

/**
 * Request-scoped structured logging for the off-chain backend (issue #707).
 * Mirrors the Next.js app's lib/logger.ts JSON line shape
 * (timestamp/level/requestId/route/message/...fields) so log lines from
 * either service read the same way in whatever log aggregator ends up
 * consuming them, without either service depending on the other.
 */

const REQUEST_ID_HEADER = 'x-request-id';

const SENSITIVE_KEY_PATTERN =
  /secret|password|token|signed[-_]?xdr|xdr|signature|authorization|cookie|contact|email|phone/i;

const REDACTED = '[REDACTED]';

function redactFields(fields) {
  if (!fields) return undefined;
  const redacted = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return redacted;
}

function getOrCreateRequestId(req) {
  return req.headers[REQUEST_ID_HEADER] || crypto.randomUUID();
}

function emit(level, requestId, route, message, fields) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    requestId,
    route,
    message,
    ...redactFields(fields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function createRequestLogger(req) {
  const requestId = getOrCreateRequestId(req);
  const route = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;

  return {
    requestId,
    info: (message, fields) => emit('info', requestId, route, message, fields),
    warn: (message, fields) => emit('warn', requestId, route, message, fields),
    error: (message, fields) =>
      emit('error', requestId, route, message, fields),
  };
}

module.exports = {
  REQUEST_ID_HEADER,
  getOrCreateRequestId,
  createRequestLogger,
};
