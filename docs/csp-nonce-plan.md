# CSP: Replace `unsafe-inline` with per-request nonces

## Problem

Current CSP configuration (see `next.config.js` / `middleware.ts`) allows `'unsafe-inline'` for scripts, which weakens XSS protection.

## Implemented fix

1. `middleware.ts` generates a per-request nonce (`crypto.randomUUID()` base64-encoded) and builds the CSP via `buildCsp({ nonce })` in `lib/csp.ts`.
2. The nonce is forwarded to the app as `x-nonce` **and** the full `Content-Security-Policy` header is set on the forwarded request headers. Next.js only stamps its own framework/RSC inline scripts (`self.__next_f.push(...)`) with a nonce when it can read the CSP header from the request, so setting it on the request is required for a production build to work.
3. The same CSP (same nonce) is set on the response so the browser enforces it.
4. `app/layout.tsx` reads `x-nonce` and applies it to the no-flash theme bootstrap script. Sentry and Vercel Analytics inline scripts inherit the nonce from the request CSP header.
5. `script-src` uses `'self' 'nonce-<value>' 'strict-dynamic'` in production. `'unsafe-inline'` is **not** used in production; it is only present in development where Next.js requires it for HMR.

## Dynamic rendering and nonces

A per-request nonce cannot be baked into cached HTML, so any route that renders inline scripts must be rendered dynamically (or use a documented hash-based policy). The following routes are forced dynamic for this reason:

- `/` and locale-prefixed pages (`/[locale]`) — render the theme bootstrap and framework scripts.
- `/player/[id]` — previously ISR (`revalidate = 60`); now dynamic so the nonce is fresh per request.
- `/scout`, `/sponsorship` — dynamic for the same reason.

If a route must remain statically optimized/ISR, it needs a hash-based `script-src` policy instead of a nonce; that is not currently used.

## Verification

- `__tests__/lib/csp*.test.ts` cover the dev vs prod `script-src` and the Sentry origin resolution (`NEXT_PUBLIC_SENTRY_DSN`).
- `e2e/csp.spec.ts` runs against the production build in the existing `e2e` CI job, listens for `securitypolicyviolation` and console CSP errors on `/en`, `/en/player/<fixture>`, `/en/scout`, and `/en/sponsorship`, and asserts that no reports were posted to `/api/csp-report` during the run.
