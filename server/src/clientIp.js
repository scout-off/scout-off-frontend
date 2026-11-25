/**
 * The client's IP address as Express resolves it (#1775).
 *
 * `app.set('trust proxy', TRUST_PROXY_HOPS)` makes `req.ip` hop-aware: with 0
 * hops it is the socket address and a forged X-Forwarded-For has no effect;
 * with N hops it is the address N proxies back. Never parse X-Forwarded-For
 * by hand — its leftmost entry is whatever the client chose to send.
 *
 * IPv4-mapped IPv6 addresses (`::ffff:203.0.113.7`) are normalised to plain
 * IPv4 so hashes of the same client stay stable.
 */
function getClientIp(req) {
  const ip = req?.ip || req?.socket?.remoteAddress || '';
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

module.exports = { getClientIp };
