# Deployment Guide

## Sentry Error Tracking

ScoutOff uses [@sentry/nextjs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) for error tracking.

### Setup

1. Create a project at [sentry.io](https://sentry.io) and copy the DSN.
2. Add the following to your `.env` (see `.env.example`):

```
NEXT_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
SENTRY_AUTH_TOKEN=<token>   # optional — enables source map upload
SENTRY_ORG=<org-slug>
SENTRY_PROJECT=<project-slug>
```

### Behaviour

- Sentry is **disabled** in `NODE_ENV=development` and `NODE_ENV=test`.
- In production, `tracesSampleRate` is set to `0.1` (10 % of transactions) to limit volume.
- All Sentry payloads pass through a `beforeSend` hook that scrubs Stellar wallet addresses (56-char base32 strings starting with `G`) and replaces them with `[wallet_address]`.
- Contract call failures in `lib/contract.ts` are explicitly captured with a `contract` context object containing the method name, player/scout ID, and transaction status.

### Config files

| File | Purpose |
|---|---|
| `sentry.client.config.ts` | Browser-side Sentry init |
| `sentry.server.config.ts` | Node.js server-side Sentry init |
| `sentry.edge.config.ts` | Edge runtime Sentry init |

---

## Internationalisation (i18n)

ScoutOff uses [next-intl](https://next-intl-docs.vercel.app/) with the Next.js App Router.

### Supported locales

| Code | Language |
|---|---|
| `en` | English (default) |
| `fr` | French |

### Adding a new locale

1. Add the locale code to `i18n/routing.ts` → `locales` array.
2. Create `messages/<locale>.json` with all keys from `messages/en.json`.
3. Add the locale to the `LOCALES` array in `components/Navbar.tsx`.

### Message files

All static UI strings live in `messages/`:

```
messages/
  en.json   # English
  fr.json   # French
```

### Locale persistence

The chosen locale is persisted via the URL path prefix (`/en/...`, `/fr/...`). The next-intl middleware reads the `NEXT_LOCALE` cookie and the `Accept-Language` header to determine the initial locale when no prefix is present, then redirects to the prefixed URL.

### Environment variable

```
NEXT_PUBLIC_DEFAULT_LOCALE=en   # default locale (en | fr)
```
