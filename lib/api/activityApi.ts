/**
 * Admin activity-feed API helpers (issue #1516).
 */
import { backendClient as api } from './playersApi';

export type ActivityEventType =
  | 'player_registered'
  | 'milestone_approved'
  | 'milestone_revoked'
  | 'scout_subscribed'
  | 'player_contacted'
  | 'fees_withdrawn';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: number;
  actor: string;
  subjectId?: string;
  /** Ledger the event was emitted in, when the source reports it. */
  ledger?: number;
}

export const fetchActivityEvents = (
  page = 1,
  pageSize = 20,
): Promise<{ events: ActivityEvent[]; total: number }> =>
  api
    .get('/admin/activity', { params: { page, pageSize } })
    .then((r) => r.data);
