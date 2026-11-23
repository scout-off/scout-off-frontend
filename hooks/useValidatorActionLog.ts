'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchEvents, type IndexedEvent } from '@/lib/indexerClient';

const MAX_PAGES = 10; // caps at 10 * 200 = 2000 events per type, matching useApprovedPlayers/useSpendingSummary

type MilestoneEventType = 'milestone_approved' | 'milestone_revoked';

async function fetchAllEventsOfType(
  type: MilestoneEventType,
): Promise<IndexedEvent[]> {
  const all: IndexedEvent[] = [];
  let cursor: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, nextCursor } = await fetchEvents({
      type,
      limit: 200,
      before: cursor,
    });
    all.push(...events);
    if (nextCursor === null || events.length === 0) break;
    cursor = nextCursor;
  }

  return all;
}

export type ValidatorActionType = 'approved' | 'revoked';

export interface ValidatorActionEntry {
  id: string;
  timestamp: number;
  validator: string | null;
  playerId: string | null;
  milestoneId: string | null;
  action: ValidatorActionType;
}

function toEntry(
  event: IndexedEvent,
  action: ValidatorActionType,
): ValidatorActionEntry {
  return {
    id: `${event.type}-${event.id}`,
    timestamp: event.timestamp,
    validator: event.validator,
    playerId: event.playerId,
    milestoneId:
      typeof event.data.milestone_id === 'string'
        ? event.data.milestone_id
        : null,
    action,
  };
}

async function fetchValidatorActionLog(): Promise<ValidatorActionEntry[]> {
  const [approved, revoked] = await Promise.all([
    fetchAllEventsOfType('milestone_approved'),
    fetchAllEventsOfType('milestone_revoked'),
  ]);

  const entries = [
    ...approved.map((e) => toEntry(e, 'approved')),
    ...revoked.map((e) => toEntry(e, 'revoked')),
  ];

  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}

const VALIDATOR_ACTION_LOG_KEY = 'validator-action-log';

export interface ValidatorActionLogFilter {
  /** Unix seconds, inclusive lower bound. */
  from?: number;
  /** Unix seconds, inclusive upper bound. */
  to?: number;
  validator?: string;
}

/**
 * Consolidated log of validator approve/revoke actions on player milestones
 * (issue #570) — distinct from components/admin/AdminAuditLog.tsx, which
 * covers admin-panel actions (validator add/remove, fee withdrawal,
 * pause/unpause). Sourced entirely from packages/indexer's event history
 * rather than a new data store, per the milestone_approved/milestone_revoked
 * events already indexed there.
 */
export function useValidatorActionLog() {
  const { data, error, isValidating, mutate } = useSWR<ValidatorActionEntry[]>(
    VALIDATOR_ACTION_LOG_KEY,
    fetchValidatorActionLog,
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const [filter, setFilter] = useState<ValidatorActionLogFilter>({});

  const entries = data ?? [];

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filter.from !== undefined && entry.timestamp < filter.from)
        return false;
      if (filter.to !== undefined && entry.timestamp > filter.to) return false;
      if (filter.validator && entry.validator !== filter.validator)
        return false;
      return true;
    });
  }, [entries, filter]);

  const validators = useMemo(
    () =>
      [
        ...new Set(
          entries.map((e) => e.validator).filter((v): v is string => !!v),
        ),
      ].sort(),
    [entries],
  );

  const refetch = useCallback(
    () => mutate(undefined, { revalidate: true }),
    [mutate],
  );

  return {
    entries: filteredEntries,
    validators,
    loading: isValidating && !data,
    error: error?.message ?? null,
    filter,
    setFilter,
    refetch,
  };
}
