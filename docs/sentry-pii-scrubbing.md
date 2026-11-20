# Sentry PII scrubbing

All Sentry runtimes (`sentry.client.config.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts`) share `lib/sentryScrub.ts`, wired into
`beforeSend` (errors), `beforeSendTransaction` (performance transactions and
their spans) and `beforeBreadcrumb` (fetch/XHR URLs, console logs, navigation).
`sendDefaultPii` is explicitly `false`.

## What is redacted

Every string in the payload (object keys included) is scanned:

| Data                    | Pattern                             | Replacement        |
| ----------------------- | ----------------------------------- | ------------------ |
| Stellar public keys     | `G[A-Z2-7]{55}`                     | `[wallet_address]` |
| Muxed Stellar addresses | `M[A-Z2-7]{68}`                     | `[wallet_address]` |
| Stellar secret seeds    | `S[A-Z2-7]{55}`                     | `[secret_seed]`    |
| Email addresses         | `local@domain.tld`                  | `[email]`          |
| E.164 phone numbers     | `+` / `%2B` followed by 8–15 digits | `[phone]`          |

In addition, `request.cookies` and any `cookie` request header are removed,
so cookies are never sent.

If scrubbing throws, the event or breadcrumb is dropped rather than sent
unscrubbed. Circular references are replaced with `[circular]`.

## Not redacted

IPFS CIDs are not treated as sensitive: they are public content addresses of
media that is already publicly retrievable, and keeping them helps debug
upload and moderation issues.

`lib/telemetry.ts` additionally redacts identifiers before they become span
attributes; those spans also pass through `beforeSendTransaction`.
