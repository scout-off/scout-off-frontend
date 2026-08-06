# Cookie Security Audit

Quick audit of cookies set by the app and its API routes (SEP-10 session cookie, consent/preference cookies).

## Findings

| Cookie                       | Purpose                | HttpOnly         | Secure                           | SameSite                                                            |
| ---------------------------- | ---------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------- |
| SEP-10 session cookie        | Auth session           | Should be `true` | Should be `true` in production   | `Lax` recommended (avoid `None` unless cross-site flows require it) |
| Consent / preference cookies | Non-sensitive UI prefs | Not required     | Recommended `true` in production | `Lax`                                                               |

## Recommended fixes

- Set `HttpOnly: true` and `Secure: process.env.NODE_ENV === 'production'` on the session cookie so it cannot be read from client-side JS and is never sent over plain HTTP in prod.
- Use `SameSite=Lax` for the session cookie unless a documented cross-site flow (e.g. embedded widget) requires `SameSite=None`, in which case `Secure` must also be `true`.
- Apply the same `Secure`/`SameSite` baseline to any consent/preference cookies; `HttpOnly` is optional for those since they are read by client JS.

## Status

Tracked for follow-up implementation — no cookie-setting code has been changed as part of this pass; this document records the audit and the fix to apply next.
