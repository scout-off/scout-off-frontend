# PR #1164: Automated moderation logging

## Summary

This PR adds logging infrastructure for automated moderation decisions in the chat API, allowing admins to review patterns of false positives without exposing private message content.

## Changes

- **New File**: `lib/moderationLog.ts`
  - Shared types and helper functions for automated moderation logging
  - Defines `AutomatedModerationEntry` shape
  - Includes `toAdminAuditEntry()` helper to convert to audit log format

- **New File**: `app/api/admin/automated-moderation-log/route.ts`
  - `POST` endpoint to record automated moderation decisions
  - `GET` endpoint to retrieve automated moderation entries
  - Supports filtering by user, date range
  - Fire-and-forget: doesn't block the moderation action

- **New File**: `components/admin/AutomatedModerationLog.tsx`
  - Admin-facing panel to review automated moderation decisions
  - Filters by severity and user ID
  - Displays rule, severity, context for each decision

- **Modified File**: `app/[locale]/admin/page.tsx`
  - Added `AutomatedModerationLog` component to admin dashboard

- **New File**: `docs/automated-moderation-logging.md`
  - Documents the logging system
  - Privacy considerations (no message content stored)
  - Integration guide for chat API server

## Design Decisions

### Privacy-first logging

Per `docs/contact-details-privacy.md`, private message content is NOT stored in these logs. Only metadata is retained:
- User ID affected
- Thread ID (if applicable)
- Rule/heuristic that triggered
- Timestamp
- Context (matched keywords, confidence score)

This ensures that even if the admin audit log is compromised, private chat content is not exposed.

### Fire-and-forget pattern

The logging call is independent of the moderation action:
1. Chat service applies automated filter
2. If action taken, POST to logging endpoint
3. Moderation proceeds regardless of logging success

This matches the existing `recordAuditEntry` pattern and prevents network issues from delaying moderation.

### Audit log integration

Automated moderation entries are stored in the same `AdminAuditStore` used for admin actions, using action type prefix `automated_moderation_`. This allows admins to view all moderation-related activity in one place.

## Acceptance Criteria Met

- [x] Automated moderation decisions recorded with metadata (thread/user ID, rule, severity, context)
- [x] Admin-facing surface lists recent automated moderation actions for spot-review
- [x] Logging does not block or delay the moderation action itself (fire-and-forget)
- [x] Message content NOT stored (privacy-first approach)

## Integration with Chat API

The chat API server should call `POST /api/admin/automated-moderation-log` when it makes an automated decision:

```typescript
await fetch('https://your-scout-off-frontend-api/api/admin/automated-moderation-log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: `${threadId}:block:${ruleName}`,
    category: 'message_filter',
    rule: ruleName,
    severity: 'high',
    userId: blockedUserId,
    threadId,
    timestamp: Date.now() / 1000,
    context: { matchedKeywords, confidence: 0.95 },
  }),
});
```

## Related Issue

- Issue #1164: Add logging for automated moderation decisions
