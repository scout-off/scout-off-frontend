'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { sanitize } from '@/lib/sanitize';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { buildRegisterPlayer } from '@/lib/contract';
import { waitForInclusion } from '@/lib/tx';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import VideoUpload from '@/components/ui/VideoUpload';
import { AFRICAN_REGIONS } from '@/lib/regions';
import type { PlayerVitals } from '@/types';
import type { TxStatus } from '@/components/ui/TransactionStatus';

interface PlayerProfileFormProps {
  onSuccess: (playerId: string) => void;
}

/**
 * Football position options with short code and label.
 *
 * Position values and labels are intentionally hardcoded: they form a small
 * static enum shared across all locales and re-translating "Goalkeeper" /
 * "Centre-Back" would only introduce ambiguity for downstream contract data
 * that already references the English values.
 */
const FOOTBALL_POSITIONS: { value: string; label: string }[] = [
  { value: 'GK', label: 'Goalkeeper' },
  { value: 'CB', label: 'Centre-Back' },
  { value: 'LB', label: 'Left-Back' },
  { value: 'RB', label: 'Right-Back' },
  { value: 'CM', label: 'Central Midfielder' },
  { value: 'CAM', label: 'Attacking Midfielder' },
  { value: 'LW', label: 'Left Winger' },
  { value: 'RW', label: 'Right Winger' },
  { value: 'ST', label: 'Striker' },
];

// AFRICAN_REGIONS labels stay hardcoded intentionally: they are the canonical
// transliteration of country / region names that downstream search and
// ScoutOff analytics depend on. Translating them per-locale would desync the
// on-chain region slug from the human-readable label.

export default function PlayerProfileForm({
  onSuccess,
}: PlayerProfileFormProps) {
  const t = useTranslations('player_dashboard');
  const { publicKey, signAndSubmit } = useWallet();
  const isPaused = useIsPaused();
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    position: '',
    region: '',
    nationality: '',
    bio: '',
    ipfsHash: '',
  });

  // Abort any in-flight inclusion poll when the form unmounts so a user
  // navigating away doesn't keep hitting the RPC after the page is gone and
  // so we never call setState on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('form.name_required');
    }

    if (!formData.age) {
      newErrors.age = t('form.age_required');
    } else {
      const ageNum = parseInt(formData.age);
      if (isNaN(ageNum) || ageNum < 14 || ageNum > 45) {
        newErrors.age = t('form.age_out_of_range');
      }
    }

    if (!formData.position) {
      newErrors.position = t('form.position_required');
    }

    if (!formData.region) {
      newErrors.region = t('form.region_required');
    }

    if (!formData.nationality.trim()) {
      newErrors.nationality = t('form.nationality_required');
    }

    if (!formData.ipfsHash) {
      newErrors.ipfsHash = t('form.highlight_required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Sanitize free-text fields (player bio) before any submission
    const sanitizedBio = sanitize(formData.bio);
    setFormData((prev: typeof formData) => ({ ...prev, bio: sanitizedBio }));

    if (!validate()) return;
    if (!publicKey) {
      setErrors({ form: t('form.wallet_not_connected') });
      return;
    }

    if (isPaused) {
      setErrors({ form: t('form.transactions_disabled') });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsConfirming(false);
    setErrors({});
    setTxStatus('pending');
    setTxHash(null);

    // Single try/catch/finally that runs through submit → confirm → success.
    // Two invariants enforced simultaneously:
    //  1. `succeeded` flips true when waitForInclusion resolves SUCCESS;
    //     while true, the finally block leaves the form in busy=true so the
    //     user can't accidentally double-pay during the brief window between
    //     onSuccess firing and the parent's SWR refetch unmounting the form.
    //  2. The `signal.aborted` check guards every cleanup setState, so the
    //     abort-cleanup path can never touch a torn-down component (React 18
    //     won't warn, but the very next React major may).
    let succeeded = false;
    try {
      const vitals: PlayerVitals = {
        name: formData.name,
        age: parseInt(formData.age),
        position: formData.position,
        region: formData.region,
        nationality: formData.nationality,
      };

      const xdr = await buildRegisterPlayer(
        publicKey,
        vitals,
        formData.ipfsHash,
      );

      // Submitting phase. The tx is being signed by the wallet and sent to the
      // Soroban RPC, which only confirms the network has *accepted* it.
      const result = await signAndSubmit(xdr);

      const hash = (result as any)?.hash ?? null;
      setTxHash(hash);

      // Hard-won refinement: do not declare success or call onSuccess until
      // the tx has actually been included in a closed ledger. Without this
      // wait, a page that calls refetch() right away can briefly re-show the
      // registration form because contract state hasn't yet updated.
      setIsLoading(false);
      setIsConfirming(true);

      await waitForInclusion(hash, { signal: controller.signal });
      setTxStatus('success');
      succeeded = true;
      const playerId = (result as any)?.id || publicKey;
      onSuccess(playerId);
    } catch (error) {
      // AbortError is unmount / navigation — clean and silent.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setTxStatus('error');
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : t('form.confirmation_failed'),
      });
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        // On the success path we deliberately leave isConfirming=true so
        // the submit button stays locked through the SWR-refetch window;
        // the parent unmounts the form once the freshly-registered player
        // data arrives, so we never need to manually unlock it. Unlocking
        // here would re-open the original double-pay race.
        if (!succeeded) {
          setIsConfirming(false);
        }
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev: typeof formData) => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev: Record<string, string>) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const busy = isLoading || isConfirming;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('form.name')}
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className={`input ${errors.name ? 'border-red-500' : ''}`}
          placeholder={t('form.name_placeholder')}
        />
        {errors.name && (
          <p className="text-sm text-red-500 mt-1">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('form.age')}
        </label>
        <input
          type="number"
          name="age"
          value={formData.age}
          onChange={handleChange}
          className={`input ${errors.age ? 'border-red-500' : ''}`}
          placeholder={t('form.age_placeholder')}
          min={14}
          max={45}
        />
        {errors.age && (
          <p className="text-sm text-red-500 mt-1">{errors.age}</p>
        )}
      </div>

      <Select
        label={t('form.position')}
        name="position"
        value={formData.position}
        onChange={handleChange}
        error={errors.position}
      >
        <option value="">{t('form.select_position')}</option>
        {FOOTBALL_POSITIONS.map((pos) => (
          <option key={pos.value} value={pos.value}>
            {pos.label}
          </option>
        ))}
      </Select>

      <Select
        label={t('form.region')}
        name="region"
        value={formData.region}
        onChange={handleChange}
        error={errors.region}
      >
        <option value="">{t('form.select_region')}</option>
        {AFRICAN_REGIONS.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('form.nationality')}
        </label>
        <input
          type="text"
          name="nationality"
          value={formData.nationality}
          onChange={handleChange}
          className={`input ${errors.nationality ? 'border-red-500' : ''}`}
          placeholder={t('form.nationality_placeholder')}
        />
        {errors.nationality && (
          <p className="text-sm text-red-500 mt-1">{errors.nationality}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('form.bio')}
        </label>
        <textarea
          name="bio"
          value={formData.bio}
          onChange={handleChange}
          className="input resize-none"
          rows={3}
          placeholder={t('form.bio_placeholder')}
        />
      </div>

      <VideoUpload
        onUpload={(cid) =>
          setFormData((prev: typeof formData) => ({ ...prev, ipfsHash: cid }))
        }
        error={errors.ipfsHash}
      />

      {errors.form && (
        <p className="text-sm text-red-500 text-center">{errors.form}</p>
      )}

      <Button
        type="submit"
        isLoading={busy}
        disabled={busy}
        className="w-full"
      >
        {isConfirming
          ? t('form.confirming')
          : isLoading
            ? t('form.submitting')
            : t('form.submit')}
      </Button>
    </form>
  );
}
