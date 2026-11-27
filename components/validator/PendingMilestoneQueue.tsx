'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useValidatorPendingQueue } from '@/hooks/useValidatorPendingQueue';
import { useApprovalQueue } from '@/hooks/useApprovalQueue';
import { useApprovedPlayers } from '@/hooks/useApprovedPlayers';
import { useValidator } from '@/hooks/useValidator';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { decideMilestoneSubmission } from '@/lib/api';
import {
  CONFIRM_MAX_ATTEMPTS,
  CONFIRM_POLL_INTERVAL_MS,
  isOnChainApproved,
  submitAndConfirmApproval,
  type ApprovalPhase,
} from '@/lib/confirmApprovalSubmission';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { MilestoneSubmission } from '@/types';
import { getExplorerTxUrl } from '@/lib/network';

type SortOrder = 'oldest' | 'newest';
type PlayerFilter = 'all' | 'previously-approved';
type ItemStatus =
  | 'signing'
  | 'confirming'
  | 'success'
  | 'event_lag'
  | 'failed'
  | 'timeout'
  | 'error'
  | 'skipped';

interface PendingMilestoneQueueProps {
  validatorAddress: string;
}

function sortSubmissions(
  submissions: MilestoneSubmission[],
  order: SortOrder,
): MilestoneSubmission[] {
  const sorted = [...submissions].sort((a, b) => a.createdAt - b.createdAt);
  return order === 'newest' ? sorted.reverse() : sorted;
}

function phaseToItemStatus(phase: ApprovalPhase): ItemStatus | null {
  switch (phase) {
    case 'signing':
      return 'signing';
    case 'submitted':
    case 'confirming':
      return 'confirming';
    case 'success':
      return 'success';
    case 'event_lag':
      return 'event_lag';
    case 'failed':
      return 'failed';
    case 'timeout':
      return 'timeout';
    case 'error':
      return 'error';
    default:
      return null;
  }
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function isLeaseActive(submission: MilestoneSubmission): boolean {
  return (
    !!submission.claimedBy &&
    !!submission.leaseExpiresAt &&
    submission.leaseExpiresAt > Date.now()
  );
}

export default function PendingMilestoneQueue({
  validatorAddress,
}: PendingMilestoneQueueProps) {
  const { submissions, loading, error, refetch } =
    useValidatorPendingQueue(validatorAddress);
  const { players: approvedPlayers } = useApprovedPlayers(validatorAddress);
  const { approveMilestone } = useValidator(validatorAddress);
  const { signAndSubmit } = useWallet();
  const approvalQueue = useApprovalQueue(validatorAddress);
  const isPaused = useIsPaused();
  const tContractStatus = useTranslations('contract_status');

  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const [itemHash, setItemHash] = useState<Record<string, string>>({});
  const [bulkSummary, setBulkSummary] = useState<{
    succeeded: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const cancelBulkRef = useRef(false);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const previouslyApprovedIds = useMemo(
    () => new Set(approvedPlayers.map((p) => p.id)),
    [approvedPlayers],
  );

  // Sort/filter apply instantly client-side — no refetch or page reload.
  const visibleSubmissions = useMemo(() => {
    const filtered =
      playerFilter === 'previously-approved'
        ? submissions.filter((s) => previouslyApprovedIds.has(s.playerId))
        : submissions;
    return sortSubmissions(filtered, sortOrder);
  }, [submissions, playerFilter, previouslyApprovedIds, sortOrder]);

  const visibleIds = useMemo(
    () => visibleSubmissions.map((s) => s.id),
    [visibleSubmissions],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  function handleCancelBulk() {
    cancelBulkRef.current = true;
    setStopRequested(true);
  }

  // Soroban transactions carry a single invoke-host-function operation each,
  // so there is no way to bundle multiple approve_milestone calls into one
  // signed transaction without a batch entry point in the contract — this
  // submits one signed transaction per selected item, sequentially, so a
  // rejected/failed signature only stops that item rather than the batch.
  // Each item has a bounded confirmation poll (~40s) so one timeout cannot
  // hang the batch indefinitely.
  //
  // A signature prompt already in flight can't cleanly be interrupted, so
  // cancellation is checked between items: the current item is always
  // allowed to finish (success or failure) before the loop stops.
  async function handleBulkApprove() {
    if (!validatorAddress || isPaused || bulkRunning) return;
    const ids = visibleIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;

    if (!isOnline) {
      await approvalQueue.enqueueMany(
        ids.flatMap((id) => {
          const submission = submissions.find((item) => item.id === id);
          return submission
            ? [
                {
                  playerId: submission.playerId,
                  milestone: submission.description,
                },
              ]
            : [];
        }),
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    cancelBulkRef.current = false;
    setStopRequested(false);
    setBulkRunning(true);
    setBulkSummary(null);
    setItemError({});
    setItemHash({});
    setItemStatus({});

    let succeeded = 0;
    let failed = 0;
    const processedIds = new Set<string>();

    for (const id of ids) {
      if (cancelBulkRef.current) break;

      const submission = submissions.find((s) => s.id === id);
      if (!submission) {
        processedIds.add(id);
        continue;
      }

      setItemStatus((prev) => ({ ...prev, [id]: 'signing' }));
      try {
        const result = await submitAndConfirmApproval({
          buildXdr: () =>
            approveMilestone(submission.playerId, submission.description),
          signAndSubmit,
          playerId: submission.playerId,
          validatorAddress,
          confirmMaxAttempts: CONFIRM_MAX_ATTEMPTS,
          confirmDelayMs: CONFIRM_POLL_INTERVAL_MS,
          // Keep event wait short in bulk so siblings are not delayed as much.
          eventReconcileTimeoutMs: 8_000,
          onPhase: (phase, meta) => {
            const mapped = phaseToItemStatus(phase);
            if (mapped) {
              setItemStatus((prev) => ({ ...prev, [id]: mapped }));
            }
            if (meta.hash) {
              setItemHash((prev) => ({ ...prev, [id]: meta.hash! }));
            }
            if (
              meta.message &&
              (phase === 'failed' || phase === 'error' || phase === 'timeout')
            ) {
              setItemError((prev) => ({ ...prev, [id]: meta.message! }));
            }
          },
        });

        if (result.status === 'success' || result.status === 'event_lag') {
          succeeded += 1;
          setItemStatus((prev) => ({ ...prev, [id]: 'success' }));
          await decideMilestoneSubmission(id, 'approve').catch(() => {});
        } else if (result.status === 'skipped') {
          setItemStatus((prev) => ({ ...prev, [id]: 'skipped' }));
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        setItemStatus((prev) => ({ ...prev, [id]: 'error' }));
        setItemError((prev) => ({
          ...prev,
          [id]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        processedIds.add(id);
      }
    }

    setBulkSummary({
      succeeded,
      failed,
      skipped: ids.length - succeeded - failed,
    });
    setBulkRunning(false);
    setStopRequested(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      processedIds.forEach((id) => next.delete(id));
      return next;
    });
    await refetch();
  }

  async function handleApproveOne(submission: MilestoneSubmission) {
    if (!validatorAddress || isPaused) return;
    const id = submission.id;

    if (
      isLeaseActive(submission) &&
      submission.claimedBy !== validatorAddress
    ) {
      setItemStatus((prev) => ({ ...prev, [id]: 'skipped' }));
      setItemError((prev) => ({
        ...prev,
        [id]: `Being reviewed by ${truncateAddress(submission.claimedBy!)}`,
      }));
      return;
    }

    if (!isOnline) {
      await approvalQueue.enqueueMany([
        { playerId: submission.playerId, milestone: submission.description },
      ]);
      return;
    }

    setItemStatus((prev) => ({ ...prev, [id]: 'signing' }));
    setItemError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const result = await submitAndConfirmApproval({
        buildXdr: () =>
          approveMilestone(submission.playerId, submission.description),
        signAndSubmit,
        playerId: submission.playerId,
        validatorAddress,
        confirmMaxAttempts: CONFIRM_MAX_ATTEMPTS,
        confirmDelayMs: CONFIRM_POLL_INTERVAL_MS,
        onPhase: (phase, meta) => {
          const mapped = phaseToItemStatus(phase);
          if (mapped) {
            setItemStatus((prev) => ({ ...prev, [id]: mapped }));
          }
          if (meta.hash) {
            setItemHash((prev) => ({ ...prev, [id]: meta.hash! }));
          }
          if (
            meta.message &&
            (phase === 'failed' || phase === 'error' || phase === 'timeout')
          ) {
            setItemError((prev) => ({ ...prev, [id]: meta.message! }));
          }
        },
      });

      if (result.status === 'success' || result.status === 'event_lag') {
        setItemStatus((prev) => ({ ...prev, [id]: 'success' }));
        await decideMilestoneSubmission(id, 'approve').catch(() => {});
      } else if (result.status === 'skipped') {
        setItemStatus((prev) => ({ ...prev, [id]: 'skipped' }));
      }
    } catch (err) {
      setItemStatus((prev) => ({ ...prev, [id]: 'error' }));
      setItemError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      await refetch();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Unable to load pending milestones"
        description={error}
      />
    );
  }

  if (visibleSubmissions.length === 0) {
    return (
      <EmptyState
        title="No pending milestones"
        description="Milestone submissions awaiting validator approval will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          options={[
            { value: 'oldest', label: 'Oldest first' },
            { value: 'newest', label: 'Newest first' },
          ]}
        />
        <Select
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value as PlayerFilter)}
          options={[
            { value: 'all', label: 'All players' },
            { value: 'previously-approved', label: 'Previously approved' },
          ]}
        />
        <Button
          variant="secondary"
          onClick={toggleSelectAllVisible}
          disabled={bulkRunning}
        >
          {allVisibleSelected ? 'Clear selection' : 'Select all'}
        </Button>
        <Button
          onClick={handleBulkApprove}
          disabled={bulkRunning || selectedIds.size === 0 || isPaused}
        >
          {bulkRunning
            ? 'Approving…'
            : `Approve selected (${selectedIds.size})`}
        </Button>
        {bulkRunning && (
          <Button variant="secondary" onClick={handleCancelBulk}>
            {stopRequested ? 'Stopping…' : 'Stop'}
          </Button>
        )}
      </div>

      {bulkSummary && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          {bulkSummary.succeeded} approved · {bulkSummary.failed} failed ·{' '}
          {bulkSummary.skipped} skipped
        </div>
      )}

      <ul className="space-y-3">
        {visibleSubmissions.map((submission) => {
          const id = submission.id;
          const status = itemStatus[id];
          const claimedByOther =
            isLeaseActive(submission) &&
            submission.claimedBy !== validatorAddress;
          const hash = itemHash[id];
          return (
            <li
              key={id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.has(id)}
                    disabled={bulkRunning || claimedByOther}
                    onChange={() => toggleSelected(id)}
                    aria-label={`Select submission ${id}`}
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      {submission.description}
                    </p>
                    <p className="text-sm text-gray-500">
                      Player {truncateAddress(submission.playerId)}
                    </p>
                    {claimedByOther && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Being reviewed by{' '}
                        {truncateAddress(submission.claimedBy!)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    onClick={() => handleApproveOne(submission)}
                    disabled={
                      bulkRunning ||
                      isPaused ||
                      claimedByOther ||
                      status === 'signing' ||
                      status === 'confirming'
                    }
                  >
                    Approve
                  </Button>
                  {status && (
                    <span className="text-xs text-gray-500">
                      {tContractStatus.has(status)
                        ? tContractStatus(status)
                        : status}
                    </span>
                  )}
                  {hash && (
                    <a
                      href={getExplorerTxUrl(hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      View tx
                    </a>
                  )}
                  {itemError[id] && (
                    <span className="text-xs text-red-600">
                      {itemError[id]}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
