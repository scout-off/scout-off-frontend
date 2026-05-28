"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ApproveForm from "@/components/validator/ApproveForm";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { PROGRESS_LABELS } from "@/types";

interface PendingMilestoneQueueItem {
  playerId: string;
  playerName: string;
  progressLevel: number;
  lastMilestoneTimestamp: number;
}

const ITEMS_PER_PAGE = 20;

export default function PendingMilestoneQueue() {
  const [queue, setQueue] = useState<PendingMilestoneQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isMountedRef = useRef(true);

  const totalPages = Math.max(1, Math.ceil(queue.length / ITEMS_PER_PAGE));

  const pageItems = useMemo(
    () => queue.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [currentPage, queue]
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/validator/queue", { method: "GET" });
      if (!response.ok) {
        throw new Error(`Failed to load queue: ${response.statusText}`);
      }
      const data = (await response.json()) as PendingMilestoneQueueItem[];
      if (!isMountedRef.current) return;
      setQueue(data ?? []);
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message || "Unable to fetch pending milestones.");
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    fetchQueue();
    const intervalId = window.setInterval(fetchQueue, 30000);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [fetchQueue]);

  const openApproveModal = useCallback((playerId: string) => {
    setSelectedPlayerId(playerId);
    setIsModalOpen(true);
  }, []);

  const closeApproveModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedPlayerId(null);
  }, []);

  const handleApproveSuccess = useCallback(() => {
    closeApproveModal();
    void fetchQueue();
  }, [closeApproveModal, fetchQueue]);

  if (loading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <Spinner size="lg" className="text-brand-green" />
      </div>
    );
  }

  if (!queue.length) {
    return (
      <EmptyState
        title="No pending milestones"
        description={
          error
            ? `Unable to load pending milestones: ${error}`
            : "There are currently no milestones awaiting validator approval."
        }
        action={
          error
            ? {
                label: "Retry",
                onClick: fetchQueue,
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Pending Milestone Approvals</h2>
            <p className="text-sm text-gray-400 mt-1">
              Approve milestones for players pending validator review. The list refreshes every 30 seconds.
            </p>
          </div>
          {error && (
            <div role="status" className="rounded-xl border border-red-600 bg-red-950/50 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-brand-card">
        <table className="min-w-full divide-y divide-gray-800 text-left text-sm">
          <thead className="bg-gray-950/60 text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Current level</th>
              <th className="px-4 py-3 font-medium">Last milestone</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {pageItems.map((item) => (
              <tr key={item.playerId} className="hover:bg-white/5">
                <td className="px-4 py-4 text-white">
                  <p className="font-semibold">{item.playerName}</p>
                  <p className="text-xs text-gray-500">{item.playerId}</p>
                </td>
                <td className="px-4 py-4 text-gray-200">{PROGRESS_LABELS[item.progressLevel as 0 | 1 | 2 | 3] ?? "Unknown"}</td>
                <td className="px-4 py-4 text-gray-200">
                  {new Date(item.lastMilestoneTimestamp * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-4">
                  <Button onClick={() => openApproveModal(item.playerId)} type="button">
                    Approve
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {queue.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-400">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} type="button" disabled={currentPage === 1}>
              Previous
            </Button>
            <Button variant="secondary" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} type="button" disabled={currentPage === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeApproveModal}>
        <ApproveForm onSuccess={handleApproveSuccess} initialPlayerId={selectedPlayerId ?? ""} />
      </Modal>
    </div>
  );
}
