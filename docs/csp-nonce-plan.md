# CSP: Replace `unsafe-inline` with per-request nonces

## Problem

Current CSP configuration (see `next.config.js` / `middleware.ts`) allows `'unsafe-inline'` for scripts, which weakens XSS protection.

## Proposed fix

1. In `middleware.ts`, generate a per-request nonce (e.g. `crypto.randomUUID()` or `crypto.randomBytes(16).toString('base64')`).
2. Pass the nonce to the response via a request header (e.g. `x-nonce`) so it can be read in Server Components/`_document`.
3. Update the `Content-Security-Policy` header to use `script-src 'self' 'nonce-<value>'` instead of `'unsafe-inline'`.
4. Apply the nonce attribute to all first-party inline `<script>` tags (e.g. any inline analytics/bootstrap scripts).
5. Keep `'unsafe-inline'` as a fallback only for browsers that don't support nonces if strict backwards compatibility is required (optional, not recommended long-term).

## Status

Documented as a plan only — no changes made to `next.config.js` or `middleware.ts` in this pass to avoid touching existing behavior without review/testing. Implementation should be picked up as a follow-up ticket.
