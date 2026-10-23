<!-- Branch: fix/1513-offline-fallback-page -->
<!-- Title: fix(#1513): add localized offline fallback page for PWA navigations -->

## Summary

The installed PWA had no offline fallback document: navigating to an uncached
page while offline showed the browser's generic error screen (Chrome's
"dinosaur" or Firefox's "Unable to connect") instead of a branded, helpful
page. This PR adds `public/offline.html` and wires it into the next-pwa
`fallbacks.document` config so the service worker serves it for any navigation
request that fails while the device has no network.

## Problem

- `public/` had no `offline.html`.
- `next.config.js` passed no `fallbacks` option to `withPWA`, so Workbox
  never precached or served a fallback document.
- The existing `OfflineBanner` (component) only renders inside a live page;
  it cannot appear on a navigation to a page that isn't cached at all.

## Solution

### `public/offline.html`

A self-contained static HTML page — no external assets, no CDN fonts, no
framework JS — that renders correctly even when Cache Storage is cold:

- **Brand-aligned**: uses the same `#0a0f1e` background, `#22c55e` green
  accent, and Inter-stack font-family as the Next.js app shell.
- **Accessible**: landmark `<main>`, descriptive heading, visible focus ring
  on the retry button, `aria-pressed` on language switcher buttons, `lang`
  attribute updated dynamically.
- **Localized**: all visible copy (heading, body, retry button) is available
  in English, French (fr), and Swahili (sw) — the three locales the app
  supports. The active language is determined from `localStorage` (the app's
  own locale preference key) falling back to `navigator.language`, with a
  lightweight in-page switcher so users can change it without a network
  request.
- **Retry button**: `window.location.reload()` — if connectivity has
  returned the real page loads; if not, the fallback is served again.
- **No external fetches**: all styles are inline `<style>`, the wifi-off
  icon is an inline SVG, and the i18n strings are embedded in a `<script>`
  block. The page adds no entries to the service worker's fetch log.

### `next.config.js`

Added `fallbacks: { document: '/offline.html' }` to the `withPWA` options.
next-pwa (Workbox) precaches `/offline.html` at build time and inserts a
catch-handler for navigation requests that fail while offline, serving the
precached copy.

### `messages/{en,fr,sw}.json`

Added `offline.fallback_heading`, `offline.fallback_body`, and
`offline.fallback_retry` keys alongside the existing `offline.bannerMessage`
key. These keys are the canonical source of truth for the strings embedded
in `public/offline.html`; if the copy ever diverges the locale files are the
authoritative version to update.

## Files changed

| File | Change |
|------|--------|
| `public/offline.html` | New — self-contained branded offline fallback page (en/fr/sw) |
| `next.config.js` | Add `fallbacks: { document: '/offline.html' }` to `withPWA` |
| `messages/en.json` | Add `offline.fallback_{heading,body,retry}` keys |
| `messages/fr.json` | Add `offline.fallback_{heading,body,retry}` keys |
| `messages/sw.json` | Add `offline.fallback_{heading,body,retry}` keys |

## Validation

| Check | Result |
|-------|--------|
| `node scripts/validate-pr-bodies.js` | ✅ passes |
| `node scripts/check-locale-keys.js` | ✅ all three locales in sync |
| `npm run type-check` | ✅ no new errors |
| Manual: open app, go offline, navigate to uncached page | ✅ `offline.html` served |

## Out of scope

- Migration from next-pwa 5.6.0 to Serwist (tracked in issue #1514) — the
  `fallbacks` option used here is identical in both toolchains, so this PR
  applies cleanly regardless of which migration path is taken.
- A Next.js App Router `app/offline/page.tsx` server-rendered equivalent —
  the static HTML approach is the only option that works without a network
  request to the Next.js server, which is exactly what offline means.

Closes #1513
