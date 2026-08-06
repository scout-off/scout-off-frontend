'use client';

import { useMemo, useState } from 'react';
import { useValidatorPendingQueue } from '@/hooks/useValidatorPendingQueue';
import { useApprovedPlayers } from '@/hooks/useApprovedPlayers';
import { useValidator } from '@/hooks/useValidator';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { decideMilestoneSubmission } from '@/lib/api';
import { parseContractError } from '@/lib/contractErrorMessage';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { MilestoneSubmission } from '@/types';

type SortOrder = 'oldest' | 'newest';
type PlayerFilter = 'all' | 'previously-approved';
type ItemStatus = 'signing' | 'success' | 'failed';

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

export default function PendingMilestoneQueue({
  validatorAddress,
}: PendingMilestoneQueueProps) {
  const { submissions, loading, error, refetch } =
    useValidatorPendingQueue(validatorAddress);
  const { players: approvedPlayers } = useApprovedPlayers(validatorAddress);
  const { approveMilestone } = useValidator(validatorAddress);
  const { signAndSubmit } = useWallet();
  const isPaused = useIsPaused();

  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const [bulkSummary, setBulkSummary] = useState<{
    succeeded: number;
    failed: number;
  } | null>(null);

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

  // Soroban transactions carry a single invoke-host-function operation each,
  // so there is no way to bundle multiple approve_milestone calls into one
  // signed transaction without a batch entry point in the contract — this
  // submits one signed transaction per selected item, sequentially, so a
  // rejected/failed signature only stops that item rather than the batch.
  async function handleBulkApprove() {
    if (!validatorAddress || isPaused || bulkRunning) return;
    const ids = visibleIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;

    setBulkRunning(true);
    setBulkSummary(null);
    setItemError({});
    setItemStatus(Object.fromEntries(ids.map((id) => [id, 'signing'])));

    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      const submission = submissions.find((s) => s.id === id);
      if (!submission) continue;

      setItemStatus((prev) => ({ ...prev, [id]: 'signing' }));
      try {
        const xdr = await approveMilestone(
          submission.playerId,
          submission.description,
        );
        const hash = await signAndSubmit(xdr);
        await decideMilestoneSubmission(id, 'approved', hash);
        setItemStatus((prev) => ({ ...prev, [id]: 'success' }));
        succeeded++;
      } catch (e) {
        setItemStatus((prev) => ({ ...prev, [id]: 'failed' }));
        setItemError((prev) => ({ ...prev, [id]: parseContractError(e) }));
        failed++;
      }
    }

    setBulkSummary({ succeeded, failed });
    setSelectedIds(new Set());
    setBulkRunning(false);
    refetch(); // drop the now-approved items from the pending list
  }

  const selectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Pending Milestones</h2>
        {!loading && !error && (
          <span className="text-sm text-gray-400">
            {visibleSubmissions.length} pending
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <Select
          id="pending-queue-sort"
          label="Sort"
          className="w-40"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
        >
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </Select>

        <Select
          id="pending-queue-filter"
          label="Filter"
          className="w-56"
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value as PlayerFilter)}
        >
          <option value="all">All players</option>
          <option value="previously-approved">
            Only players I&apos;ve previously approved
          </option>
        </Select>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-16 rounded-lg bg-gray-800/50 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-between">
          <p className="text-red-400 text-sm">
            Could not load pending milestones.
          </p>
          <Button variant="secondary" onClick={refetch}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && visibleSubmissions.length === 0 && (
        <EmptyState
          title="No pending milestones"
          description={
            playerFilter === 'previously-approved'
              ? "No pending submissions from players you've previously approved."
              : 'New submissions from players will appear here for review.'
          }
        />
      )}

      {!loading && !error && visibleSubmissions.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-gray-800 pb-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                disabled={bulkRunning}
                aria-label="Select all visible pending milestones"
              />
              Select all
            </label>
            <Button
              onClick={handleBulkApprove}
              isLoading={bulkRunning}
              disabled={
                selectedCount === 0 ||
                bulkRunning ||
                isPaused ||
                !validatorAddress
              }
              title={isPaused ? 'Contract is currently paused' : undefined}
            >
              {bulkRunning
                ? `Approving ${selectedCount}…`
                : `Bulk Approve${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </Button>
          </div>

          {bulkSummary && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-md border p-3 text-sm ${
                bulkSummary.failed > 0
                  ? 'border-red-500 bg-red-950/30 text-red-300'
                  : 'border-brand-green bg-brand-green/10 text-brand-green'
              }`}
            >
              {bulkSummary.failed > 0
                ? `${bulkSummary.succeeded} of ${bulkSummary.succeeded + bulkSummary.failed} approvals succeeded — ${bulkSummary.failed} failed and remain pending for retry.`
                : `All ${bulkSummary.succeeded} selected milestones were approved.`}
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {visibleSubmissions.map((submission) => {
              const status = itemStatus[submission.id];
              return (
                <li
                  key={submission.id}
                  className="border border-gray-700 rounded-lg p-4 flex flex-col gap-1"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedIds.has(submission.id)}
                      onChange={() => toggleSelected(submission.id)}
                      disabled={bulkRunning}
                      aria-label={`Select milestone for ${submission.playerName ?? submission.playerId}`}
                    />
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white font-medium">
                          {submission.playerName ?? submission.playerId}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(submission.createdAt).toLocaleDateString(
                            undefined,
                            { year: 'numeric', month: 'short', day: 'numeric' },
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">
                        {submission.description}
                      </p>
                      {submission.evidenceUrl && (
                        <a
                          href={submission.evidenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-green underline underline-offset-2 hover:opacity-80 w-fit"
                        >
                          View evidence
                        </a>
                      )}

                      {status === 'signing' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-yellow-300 mt-1">
                          <Spinner size="sm" className="text-yellow-300" />
                          Awaiting signature&hellip;
                        </span>
                      )}
                      {status === 'success' && (
                        <span className="text-xs text-brand-green mt-1">
                          ✓ Approved
                        </span>
                      )}
                      {status === 'failed' && (
                        <span className="text-xs text-red-400 mt-1">
                          ✕ Failed
                          {itemError[submission.id]
                            ? `: ${itemError[submission.id]}`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
