# WIP: #1521 — contact access logging and player dashboard

This branch is intentionally left as a work-in-progress draft.

Reason:
- The issue crosses the app's server auth boundary, payment-proof gate, and player dashboard permissions.
- The repo does not yet have a proven storage contract for append-only access records or a player dashboard consumer for it.
- This branch is created only so the issue remains linked to an upstream PR and can be reviewed without merging speculative code.

Planned work:
- Add append-only access log storage keyed by scout + player + timestamp + request ID.
- Expose a player-facing read API for their own access log.
- Render the list in the player dashboard and make it read-only to the owner.
