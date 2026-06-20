'use client';

import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { sanitize } from '@/lib/sanitize';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { buildRegisterPlayer } from '@/lib/contract';
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
    // Update local state synchronously so subsequent flows see sanitized value
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

    setIsLoading(true);
    setErrors({});
    setTxStatus('pending');
    setTxHash(null);

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
      const result = await signAndSubmit(xdr);

      const hash = (result as any)?.hash ?? null;
      setTxHash(hash);
      setTxStatus('success');

      const playerId = (result as any)?.id || publicKey;
      onSuccess(playerId);
    } catch (error) {
      setTxStatus('error');
      setErrors({
        form: error instanceof Error ? error.message : t('form.registration_failed'),
      });
    } finally {
      setIsLoading(false);
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
        isLoading={isLoading}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? t('form.submitting') : t('form.submit')}
      </Button>
    </form>
  );
}
