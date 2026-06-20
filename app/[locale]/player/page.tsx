'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useWallet } from '@/hooks/useWallet';
import { usePlayer } from '@/hooks/usePlayer';
import ProgressBar from '@/components/ProgressBar';
import { uploadToIPFS } from '@/lib/ipfs';
import { buildRegisterPlayer } from '@/lib/contract';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

function PlayerDashboardContent() {
  const t = useTranslations('player_dashboard');
  const { walletAddress: publicKey } = useRequireWallet();
  const { signAndSubmit } = useWallet();
  const { player, loading } = usePlayer(publicKey);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [region, setRegion] = useState('');
  const [age, setAge] = useState('');
  const [nationality, setNationality] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Capture publicKey into a narrowed local after the guard so TypeScript
  // can flow the `string` type into the handleRegister closure below.
  if (!publicKey) {
    return null; // Redirect handled by useRequireWallet
  }
  const wallet: string = publicKey;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = t('form.name_required');
    if (!position.trim()) newErrors.position = t('form.position_required');
    if (!region.trim()) newErrors.region = t('form.region_required');
    if (!age || Number.isNaN(Number(age))) {
      newErrors.age = t('form.age_required');
    } else {
      const ageNum = Number(age);
      if (ageNum < 14 || ageNum > 45) {
        newErrors.age = t('form.age_out_of_range');
      }
    }
    if (!nationality.trim()) newErrors.nationality = t('form.nationality_required');
    if (!file) newErrors.file = t('form.highlight_required');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      // file is non-null here: enforced by `if (!file) newErrors.file = ...` above.
      const cid = await uploadToIPFS(file!);
      const xdr = await buildRegisterPlayer(
        wallet,
        { name, position, region, age: parseInt(age, 10), nationality },
        cid,
      );
      await signAndSubmit(xdr);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return <p className="text-center text-gray-400 mt-20">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Player Dashboard</h1>

      {player ? (
        <>
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-white">
              {player.vitals.name}
            </h2>
            <p className="text-gray-400 text-sm">
              {player.vitals.position} · {player.vitals.region}
            </p>
            <ProgressBar level={player.progressLevel} />
          </div>

          <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Milestone History</h3>
            {player.milestones.length === 0 ? (
              <p className="text-gray-500 text-sm">No milestones yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {player.milestones.map((m) => (
                  <li
                    key={m.id}
                    className="text-sm text-gray-300 border-l-2 border-brand-green pl-3"
                  >
                    {m.description}
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {new Date(m.timestamp * 1000).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <form
          onSubmit={handleRegister}
          className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4"
          noValidate
        >
          <h2 className="text-xl font-semibold text-white">
            Create Your Profile
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('form.name')}
            </label>
            <input
              className={`input ${errors.name ? 'border-red-500' : ''}`}
              placeholder={t('form.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-1">{errors.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('form.position')}
            </label>
            <input
              className={`input ${errors.position ? 'border-red-500' : ''}`}
              placeholder={t('form.position_placeholder')}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
            {errors.position && (
              <p className="text-sm text-red-500 mt-1">{errors.position}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('form.region')}
            </label>
            <input
              className={`input ${errors.region ? 'border-red-500' : ''}`}
              placeholder={t('form.region_placeholder')}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
            {errors.region && (
              <p className="text-sm text-red-500 mt-1">{errors.region}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('form.age')}
            </label>
            <input
              className={`input ${errors.age ? 'border-red-500' : ''}`}
              type="number"
              placeholder={t('form.age_placeholder')}
              min={14}
              max={45}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            {errors.age && (
              <p className="text-sm text-red-500 mt-1">{errors.age}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('form.nationality')}
            </label>
            <input
              className={`input ${errors.nationality ? 'border-red-500' : ''}`}
              placeholder={t('form.nationality_placeholder')}
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            />
            {errors.nationality && (
              <p className="text-sm text-red-500 mt-1">
                {errors.nationality}
              </p>
            )}
          </div>
          <label className="text-sm text-gray-400">
            {t('form.highlight')}
            <input
              type="file"
              accept="video/*,image/*"
              className={`mt-1 block ${errors.file ? 'border-red-500' : ''}`}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {errors.file && (
              <p className="text-sm text-red-500 mt-1">{errors.file}</p>
            )}
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand-green text-black font-semibold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? t('form.submitting') : t('form.submit')}
          </button>
        </form>
      )}
    </div>
  );
}

export default function PlayerDashboard() {
  return (
    <ErrorBoundary>
      <PlayerDashboardContent />
    </ErrorBoundary>
  );
}
