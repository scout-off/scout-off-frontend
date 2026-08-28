# Automated moderation logging (issue #1164)

## Scope

This document describes how automated moderation decisions (e.g., auto-blocking a user for spam, flagging messages by heuristic) are logged for admin review.

## The problem

Chat moderation involves both:
1. **User-initiated actions**: A scout manually reports a message or blocks a user (logged via existing audit trail)
2. **Automated actions**: The chat API applies heuristics to auto-block or flag content

Without visibility into automated decisions, an overly aggressive filter could silently degrade legitimate scout-player communication with no feedback loop to catch false positives.

## The solution

Automated moderation decisions are recorded with the following metadata:
- **Rule/heuristic** that triggered the decision
- **Severity** (low/medium/high)  
- **User ID** affected
- **Thread ID** (if message-level)
- **Timestamp**
- **Context** (e.g., matched keywords, confidence score)

**Message content is NOT stored** to preserve privacy — only metadata needed for review.

## Where to review

Admins can view recent automated moderation actions at:
- **Admin Dashboard** → "Automated Moderation Log" panel
- Filterable by user ID and severity

## API endpoint

### POST `/api/admin/automated-moderation-log`

Records a new automated moderation decision.

**Request body:**
```json
{
  "id": "thread-123:block-user:spam-filter",
  "category": "message_filter",
  "rule": "spam_pattern_1",
  "severity": "high",
  "userId": "GUSER...",
  "threadId": "thread-123",
  "timestamp": 1700000000,
  "context": {
    "matchedKeywords": ["viagra", "cialis"],
    "confidence": 0.95
  }
}
```

**Response:** `201 Created` on success

## Integration with chat service

The chat API server should call this endpoint whenever it makes an automated decision. The call is fire-and-forget:

1. Chat service applies automated filter
2. If action taken, POST to this endpoint
3. Moderation action proceeds regardless of this call's success

This matches the existing `recordAuditEntry` pattern used for admin actions.

## Privacy considerations

- **No message content** is stored in these logs
- Only **metadata** (user IDs, thread IDs, rule name, timestamp) is recorded
- This prevents exposing private chat content in the admin audit trail
- Follows the same principle as `docs/contact-details-privacy.md`

## Future extensions

If the chat service adds more sophisticated heuristics (e.g., AI-powered content analysis), the `context` field can be extended to include:
- Matched regex patterns
- AI confidence scores
- Feature weights
- Any other diagnostic information needed for review
