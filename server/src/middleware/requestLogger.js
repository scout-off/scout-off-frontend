const {
  REQUEST_ID_HEADER,
  TRACEPARENT_HEADER,
  createRequestLogger,
  makeChildTraceparent,
  getOrCreateTraceContext,
} = require('../logger');

/**
 * Attaches a request-scoped `req.log` (see ../logger.js) and echoes both the
 * request id and the W3C `traceparent` back as response headers so an
 * upstream proxy (or the client) can confirm they were received and can
 * correlate log lines across services (issue #1478).
 *
 * The response `traceparent` is a *child* span of the incoming context —
 * same traceId, fresh spanId — so the Express service's leg shows up as a
 * distinct span in any trace viewer rather than colliding with the
 * Next.js span that initiated the call.
 */
function requestLogger(req, res, next) {
  req.log = createRequestLogger(req);

  // Echo request id so the client can report it back.
  res.setHeader(REQUEST_ID_HEADER, req.log.requestId);

  // Issue #1478: echo a child traceparent so any upstream proxy or tracing
  // tool can link this service's span to the same distributed trace.
  const traceCtx = getOrCreateTraceContext(req);
  res.setHeader(TRACEPARENT_HEADER, makeChildTraceparent(traceCtx));

  next();
}

module.exports = requestLogger;
