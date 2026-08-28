/**
 * Notification for newly-appearing reconciliation mismatches (issue #1188).
 *
 * Choice: webhook, not email. This repo has no email-sending dependency or
 * configured provider anywhere (no nodemailer, no SES/SendGrid/Resend
 * client) — adding one solely for this one alert would mean picking and
 * wiring a whole provider integration. A webhook needs nothing new: `fetch`
 * a URL the admin configures (their own Slack incoming-webhook, PagerDuty
 * events endpoint, or any HTTPS endpoint they control) with a JSON body.
 * Set RECONCILIATION_WEBHOOK_URL to enable it; unset, this is a no-op.
 */
import type { ReconciliationMismatch } from './adminAudit';

export interface ReconciliationWebhookPayload {
  checkedAt: number;
  newMismatches: ReconciliationMismatch[];
  totalMismatches: number;
}

/**
 * Fire-and-forget: a failure to deliver the webhook must never fail or
 * delay the reconciliation run itself, mirroring recordAuditEntry's
 * fire-and-forget precedent in lib/adminAuditClient.ts for the same reason
 * (the thing being logged/notified about has already happened by the time
 * this runs).
 */
export async function notifyNewMismatches(
  payload: ReconciliationWebhookPayload,
): Promise<void> {
  const url = process.env.RECONCILIATION_WEBHOOK_URL;
  if (!url || payload.newMismatches.length === 0) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${payload.newMismatches.length} new admin-audit reconciliation mismatch${payload.newMismatches.length !== 1 ? 'es' : ''} detected (${payload.totalMismatches} total as of this run).`,
        checkedAt: payload.checkedAt,
        newMismatches: payload.newMismatches,
        totalMismatches: payload.totalMismatches,
      }),
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
