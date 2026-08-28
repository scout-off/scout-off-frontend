/**
 * Logging for automated moderation decisions (issue #1164).
 *
 * The chat API server calls this module's logging functions to record
 * automated moderation actions (auto-block, auto-flag) for admin review.
 *
 * Per docs/contact-details-privacy.md and the messaging feature's own
 * privacy expectations, message content is NOT retained in these logs.
 * Only metadata (thread ID, user IDs, timestamp, matched rule) is stored
 * to avoid exposing private chat content in the admin audit trail.
 */

import type { AdminAuditStatus } from './adminAudit';

/**
 * The category of automated moderation decision.
 * Matches the pattern used for fraud flags.
 */
export const AUTOMATED_MODERATION_CATEGORIES = [
  'message_filter',
  'user_auto_block',
  'rule_match',
] as const;

export type AutomatedModerationCategory = (typeof AUTOMATED_MODERATION_CATEGORIES)[number];

/**
 * Severity of the automated decision.
 */
export type AutomatedModerationSeverity = 'low' | 'medium' | 'high';

/**
 * An automated moderation decision that should be logged.
 */
export interface AutomatedModerationEntry {
  /** Unique ID for this decision */
  id: string;
  /** Category of the automated decision */
  category: AutomatedModerationCategory;
  /** The rule or heuristic that triggered the decision */
  rule: string;
  /** Severity of the decision (for priority sorting) */
  severity: AutomatedModerationSeverity;
  /** The affected user ID */
  userId: string;
  /** Thread ID if applicable (null for user-level actions) */
  threadId?: string;
  /** Unix timestamp of the decision */
  timestamp: number;
  /** Extra context (e.g., matched keywords, confidence score) */
  context: Record<string, unknown>;
}

/**
 * Storage key for automated moderation logs.
 * Stored in the same backend as admin audit logs.
 */
export const AUTOMATED_MODERATION_STORAGE_KEY = 'scoutoff_automated_moderation';

/**
 * Adds an automated moderation decision to the log.
 * Fire-and-forget: does not block the moderation action itself.
 */
export function logAutomatedModeration(entry: AutomatedModerationEntry): void {
  // In a real implementation, this would make a POST request to
  // /api/admin/automated-moderation-log to record the entry.
  // For now, this is a placeholder to document the expected shape.
  // The chat API should call this when it makes an automated decision.
  console.log(
    `Automated moderation: ${entry.category} - ${entry.rule} for user ${entry.userId}`,
    entry,
  );
}

/**
 * Normalizes an automated moderation entry for use with the admin audit system.
 * This shape matches AdminAuditEntry but with moderation-specific fields.
 */
export function toAdminAuditEntry(entry: AutomatedModerationEntry): {
  actionType: string;
  target: string | null;
  data: Record<string, unknown>;
  status: AdminAuditStatus;
  timestamp: number;
} {
  return {
    actionType: `automated_moderation_${entry.category}`,
    target: entry.threadId ?? entry.userId,
    data: {
      rule: entry.rule,
      severity: entry.severity,
      userId: entry.userId,
      context: entry.context,
    },
    status: 'confirmed',
    timestamp: entry.timestamp,
  };
}
