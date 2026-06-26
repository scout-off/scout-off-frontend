'use client';
import { useState, FormEvent, useCallback } from 'react';
import { useTrialOffer } from '@/hooks/useTrialOffer';
import TransactionStatus, { type TxStatus } from '@/components/ui/TransactionStatus';
import Button from '@/components/ui/Button';
import type { TrialOfferType } from '@/types';

const OFFER_TYPES: { value: TrialOfferType; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'loan', label: 'Loan' },
  { value: 'transfer', label: 'Transfer' },
];

interface TrialOfferFormProps {
  playerId: string;
  onSuccess?: () => void;
}

export default function TrialOfferForm({ playerId, onSuccess }: TrialOfferFormProps) {
  const { logTrialOffer, loading, error, txHash } = useTrialOffer();

  const [clubName, setClubName] = useState('');
  const [offerType, setOfferType] = useState<TrialOfferType>('trial');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!clubName.trim()) errs.clubName = 'Club name is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    
    setTxStatus('pending');
    try {
      await logTrialOffer(playerId, {
        clubName: clubName.trim(),
        offerType,
        message: message.trim() || undefined,
      });
      setTxStatus('success');
      setClubName('');
      setOfferType('trial');
      setMessage('');
      onSuccess?.();
    } catch {
      setTxStatus('error');
    }
  }

  const handleHideStatus = useCallback(() => {
    setTxStatus(null);
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      aria-label="Log trial offer"
    >
      {/* Club name */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="tof-club"
          className="text-sm font-medium text-gray-300"
        >
          Club Name *
        </label>
        <input
          id="tof-club"
          type="text"
          value={clubName}
          onChange={(e) => {
            setClubName(e.target.value);
            if (fieldErrors.clubName)
              setFieldErrors((p) => ({ ...p, clubName: '' }));
          }}
          disabled={loading}
          className={`input${fieldErrors.clubName ? ' border-red-500' : ''}`}
          placeholder="e.g. FC Barcelona"
        />
        {fieldErrors.clubName && (
          <p role="alert" className="text-sm text-red-500">
            {fieldErrors.clubName}
          </p>
        )}
      </div>

      {/* Offer type */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="tof-type"
          className="text-sm font-medium text-gray-300"
        >
          Offer Type *
        </label>
        <select
          id="tof-type"
          value={offerType}
          onChange={(e) => setOfferType(e.target.value as TrialOfferType)}
          disabled={loading}
          className="input"
        >
          {OFFER_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Optional message */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="tof-message"
          className="text-sm font-medium text-gray-300"
        >
          Message{' '}
          <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <textarea
          id="tof-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          className="input resize-none"
          rows={3}
          placeholder="Additional details about the offer…"
        />
      </div>

      <TransactionStatus
        status={txStatus}
        txHash={txHash}
        error={error}
        onHide={handleHideStatus}
      />

      <Button
        type="submit"
        isLoading={loading}
        disabled={loading}
        className="w-full"
      >
        {loading ? 'Submitting…' : 'Submit Trial Offer'}
      </Button>
    </form>
  );
}
