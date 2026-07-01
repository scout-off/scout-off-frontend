'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { sanitize } from '@/lib/sanitize';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { extractContractErrorKey } from '@/lib/contractErrorMessage';
import { buildRegisterPlayer } from '@/lib/contract';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import VideoUpload from '@/components/ui/VideoUpload';
import TransactionStatus from '@/components/ui/TransactionStatus';
import { AFRICAN_REGIONS } from '@/lib/regions';
import type { PlayerVitals } from '@/types';
import type { TxStatus } from '@/components/ui/TransactionStatus';

const STEPS = [
  { id: 1, label: 'Personal Info' },
  { id: 2, label: 'Highlight Reel' },
  { id: 3, label: 'Review & Confirm' },
] as const;

export const FOOTBALL_POSITIONS: { value: string; label: string }[] = [
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

interface WizardData {
  name: string;
  age: string;
  nationality: string;
  region: string;
  position: string;
  bio: string;
  ipfsHash: string;
}

export interface PlayerOnboardingWizardProps {
  onSuccess: (result: {
    playerId: string;
    vitals: PlayerVitals;
    ipfsHash: string;
  }) => void;
}

// ── Progress Stepper ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Registration progress">
      <ol className="flex items-center w-full">
        {STEPS.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          return (
            <li
              key={step.id}
              className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}
            >
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                    isCompleted
                      ? 'bg-brand-green text-black'
                      : isCurrent
                        ? 'border-2 border-brand-green text-brand-green'
                        : 'border-2 border-gray-600 text-gray-500',
                  ].join(' ')}
                >
                  {isCompleted ? '✓' : step.id}
                </div>
                <span
                  className={`text-xs mt-1 whitespace-nowrap ${
                    isCurrent ? 'text-white font-medium' : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`flex-1 h-px mx-3 mb-4 transition-colors ${
                    isCompleted ? 'bg-brand-green' : 'bg-gray-700'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PlayerOnboardingWizard({
  onSuccess,
}: PlayerOnboardingWizardProps) {
  const { publicKey, signAndSubmit } = useWallet();
  const isPaused = useIsPaused();
  const tErrors = useTranslations('contractErrors');

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const nationalityRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLSelectElement>(null);
  const positionRef = useRef<HTMLSelectElement>(null);
  const step2SummaryRef = useRef<HTMLDivElement>(null);
  const [step2FocusTrigger, setStep2FocusTrigger] = useState(0);

  // Focus the step 2 summary after it mounts (element is conditionally rendered)
  useEffect(() => {
    if (step2FocusTrigger > 0) {
      step2SummaryRef.current?.focus();
    }
  }, [step2FocusTrigger]);

  const [data, setData] = useState<WizardData>({
    name: '',
    age: '',
    nationality: '',
    region: '',
    position: '',
    bio: '',
    ipfsHash: '',
  });

  const updateField = (field: keyof WizardData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    updateField(e.target.name as keyof WizardData, e.target.value);
  };

  // ── Per-step validation ───────────────────────────────────────────────────

  // ── Single-field validation ───────────────────────────────────────────────

  const validateField = (
    field: keyof WizardData,
    value: string,
  ): string | undefined => {
    switch (field) {
      case 'name': {
        const trimmed = value.trim();
        if (!trimmed) return 'Name is required';
        if (trimmed.length < 2) return 'Name must be at least 2 characters';
        if (trimmed.length > 50) return 'Name must be 50 characters or fewer';
        return undefined;
      }
      case 'age': {
        if (!value) return 'Age is required';
        const n = parseInt(value);
        if (isNaN(n) || n < 14 || n > 45)
          return 'Age must be between 14 and 45';
        return undefined;
      }
      case 'nationality':
        return value.trim() ? undefined : 'Nationality is required';
      case 'region':
        return value ? undefined : 'Region is required';
      case 'position':
        return value ? undefined : 'Position is required';
      default:
        return undefined;
    }
  };

  const validateStep1 = (): boolean => {
    const fields = [
      'name',
      'age',
      'nationality',
      'region',
      'position',
    ] as const;
    const errs: Record<string, string> = {};
    for (const field of fields) {
      const msg = validateField(field, data[field]);
      if (msg) errs[field] = msg;
    }
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      setValidationAttempted(true);
      if (errs.name) nameRef.current?.focus();
      else if (errs.age) ageRef.current?.focus();
      else if (errs.nationality) nationalityRef.current?.focus();
      else if (errs.region) regionRef.current?.focus();
      else if (errs.position) positionRef.current?.focus();
    }

    return Object.keys(errs).length === 0;
  };

  // Validate a single field on blur and surface the error immediately.
  const handleBlur = (
    e: React.FocusEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const field = e.target.name as keyof WizardData;
    const msg = validateField(field, e.target.value);
    setErrors((prev) => {
      if (!msg) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: msg };
    });
  };

  // Derived: is step 1 free of errors and all required fields touched/filled?
  const isStep1Valid =
    !validateField('name', data.name) &&
    !validateField('age', data.age) &&
    !validateField('nationality', data.nationality) &&
    !validateField('region', data.region) &&
    !validateField('position', data.position);

  const validateStep2 = (): boolean => {
    if (!data.ipfsHash) {
      setErrors({
        ipfsHash: 'Please upload your highlight reel before continuing',
      });
      setValidationAttempted(true);
      setStep2FocusTrigger((t) => t + 1);
      return false;
    }
    return true;
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setErrors({});
    setValidationAttempted(false);
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setErrors({});
    setValidationAttempted(false);
    setStep((s) => s - 1);
  };

  // ── Contract submission ───────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!publicKey) {
      setErrors({ form: 'Wallet not connected' });
      return;
    }
    if (isPaused) {
      setErrors({ form: 'Transactions are currently disabled' });
      return;
    }

    setIsLoading(true);
    setErrors({});
    setTxStatus('pending');
    setTxHash(null);

    try {
      const vitals: PlayerVitals = {
        name: data.name,
        age: parseInt(data.age),
        position: data.position,
        region: data.region,
        nationality: data.nationality,
      };

      const xdr = await buildRegisterPlayer(publicKey, vitals, data.ipfsHash);
      const result = await signAndSubmit(xdr);

      const hash = (result as any)?.hash ?? null;
      setTxHash(hash);
      setTxStatus('success');

      const playerId = (result as any)?.id || publicKey;
      onSuccess({ playerId, vitals, ipfsHash: data.ipfsHash });
    } catch (error) {
      setTxStatus('error');
      const rawMessage = error instanceof Error ? error.message : null;
      const contractKey = rawMessage
        ? extractContractErrorKey(rawMessage)
        : null;
      setErrors({
        form: contractKey
          ? tErrors(contractKey)
          : (rawMessage ?? 'Registration failed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Display labels for review ─────────────────────────────────────────────

  const positionLabel =
    FOOTBALL_POSITIONS.find((p) => p.value === data.position)?.label ??
    data.position;
  const regionLabel =
    AFRICAN_REGIONS.find((r) => r.value === data.region)?.label ?? data.region;
  const shortCid = data.ipfsHash
    ? `${data.ipfsHash.slice(0, 8)}…${data.ipfsHash.slice(-6)}`
    : '';

  return (
    <div className="space-y-8">
      <StepIndicator currentStep={step} />

      {/* ── Step 1: Personal Info ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Personal Information
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Basic details used to create your on-chain profile.
            </p>
          </div>

          {validationAttempted && Object.keys(errors).length > 0 && (
            <div
              role="alert"
              aria-label="Form validation summary"
              className="rounded-md border border-red-500 bg-red-950/30 p-3"
            >
              <p className="text-sm text-red-400 font-medium">
                Please correct the {Object.keys(errors).length} error
                {Object.keys(errors).length !== 1 ? 's' : ''} below before
                continuing.
              </p>
            </div>
          )}

          <Input
            ref={nameRef}
            id="wizard-name"
            label="Name *"
            type="text"
            name="name"
            value={data.name}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.name}
            placeholder="Enter your full name"
            autoComplete="name"
          />

          <Input
            ref={ageRef}
            id="wizard-age"
            label="Age *"
            type="number"
            name="age"
            value={data.age}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.age}
            placeholder="Enter your age (14–45)"
            min="14"
            max="45"
          />

          <Input
            ref={nationalityRef}
            id="wizard-nationality"
            label="Nationality *"
            type="text"
            name="nationality"
            value={data.nationality}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.nationality}
            placeholder="Enter your nationality"
          />

          <Select
            ref={regionRef}
            id="wizard-region"
            label="Region *"
            name="region"
            value={data.region}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.region}
          >
            <option value="">Select region</option>
            {AFRICAN_REGIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            ref={positionRef}
            id="wizard-position"
            label="Position *"
            name="position"
            value={data.position}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.position}
          >
            <option value="">Select position</option>
            {FOOTBALL_POSITIONS.map((pos) => (
              <option key={pos.value} value={pos.value}>
                {pos.label}
              </option>
            ))}
          </Select>

          <div className="space-y-1">
            <label
              htmlFor="wizard-bio"
              className="block text-sm font-medium text-gray-300"
            >
              Bio
            </label>
            <textarea
              id="wizard-bio"
              name="bio"
              value={data.bio}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="Tell us about yourself (optional)"
            />
          </div>

          <Button
            type="button"
            onClick={handleNext}
            className="w-full"
            disabled={validationAttempted && !isStep1Valid}
          >
            Continue
          </Button>
        </div>
      )}

      {/* ── Step 2: Highlight Reel ────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Highlight Reel</h2>
            <p className="text-sm text-gray-400 mt-1">
              Upload a video showcasing your skills. The upload must complete
              before you can continue.
            </p>
          </div>

          {validationAttempted && errors.ipfsHash && (
            <div
              ref={step2SummaryRef}
              role="alert"
              aria-label="Form validation summary"
              tabIndex={-1}
              className="rounded-md border border-red-500 bg-red-950/30 p-3 outline-none"
            >
              <p className="text-sm text-red-400 font-medium">
                Please correct the error below before continuing.
              </p>
            </div>
          )}

          <VideoUpload
            onUpload={(cid) => updateField('ipfsHash', cid)}
            error={errors.ipfsHash}
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="flex-1"
            >
              Back
            </Button>
            <Button type="button" onClick={handleNext} className="flex-1">
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Confirm ──────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Review &amp; Confirm
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Check your details before submitting to the Stellar blockchain.
            </p>
          </div>

          <dl className="rounded-xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800">
            {(
              [
                ['Name', data.name],
                ['Age', data.age],
                ['Nationality', data.nationality],
                ['Region', regionLabel],
                ['Position', positionLabel],
                ...(data.bio.trim()
                  ? [['Bio', sanitize(data.bio)] as [string, string]]
                  : []),
                ['Highlight Reel (IPFS)', shortCid],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between px-4 py-3 gap-4">
                <dt className="text-sm text-gray-400 shrink-0">{label}</dt>
                <dd className="text-sm text-white text-right break-all">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {txStatus && (
            <TransactionStatus
              status={txStatus}
              txHash={txHash}
              error={errors.form}
            />
          )}

          {!txStatus && errors.form && (
            <p role="alert" className="text-sm text-red-500 text-center">
              {errors.form}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              disabled={isLoading}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              isLoading={isLoading}
              disabled={isLoading || isPaused}
              title={isPaused ? 'Contract is currently paused' : undefined}
              className="flex-1"
            >
              {isLoading ? 'Registering...' : 'Register as Player'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
