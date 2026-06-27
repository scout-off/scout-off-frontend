'use client';
import { useState } from 'react';
import Modal, { useModal } from '@/components/ui/Modal';
import TransactionStatus from '@/components/ui/TransactionStatus';
import { useTrialOffer, type TrialOfferDetails } from '@/hooks/useTrialOffer';
import type { TxStatus } from '@/components/ui/TransactionStatus';

export interface TrialOfferModalProps {
  playerId: string;
  onSuccess?: () => void;
}

export default function TrialOfferModal({
  playerId,
  onSuccess,
}: TrialOfferModalProps) {
  const { isOpen, open, close } = useModal();
  const { submit, loading, error } = useTrialOffer();

  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [location, setLocation] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate form
    if (!description.trim() || !startDate || !location.trim()) {
      setTxStatus('error');
      return;
    }

    try {
      setTxStatus('pending');

      const details: TrialOfferDetails = {
        description: description.trim(),
        startDate,
        location: location.trim(),
      };

      await submit(playerId, details);
      setTxStatus('success');

      // Reset form after success
      setTimeout(() => {
        setDescription('');
        setStartDate('');
        setLocation('');
        setTxStatus(null);
        close();
        onSuccess?.();
      }, 2000);
    } catch (err) {
      setTxStatus('error');
    }
  }

  return (
    <>
      <button
        onClick={open}
        className="bg-brand-green text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 text-sm"
      >
        Log Trial Offer
      </button>

      <Modal isOpen={isOpen} onClose={close} title="Log Trial Offer">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Description Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Offer Details
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Trial for striker position focusing on finishing skills"
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-green disabled:opacity-50"
              rows={4}
            />
          </div>

          {/* Trial Date Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Trial Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-brand-green disabled:opacity-50"
            />
          </div>

          {/* Location Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Lagos, Nigeria"
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-green disabled:opacity-50"
            />
          </div>

          {/* Transaction Status */}
          {txStatus && (
            <TransactionStatus
              status={txStatus}
              error={
                error ||
                (txStatus === 'error' ? 'Please fill in all fields' : undefined)
              }
              onHide={() => {
                if (txStatus === 'success') {
                  setTxStatus(null);
                }
              }}
            />
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={
                loading || !description.trim() || !startDate || !location.trim()
              }
              className="flex-1 bg-brand-green text-black font-semibold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={loading}
              className="flex-1 bg-gray-700 text-white font-semibold py-2 rounded-lg hover:bg-gray-600 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
