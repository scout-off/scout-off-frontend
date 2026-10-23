'use client';

import { useState, useRef, useEffect, useReducer } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { usePlayer } from '@/hooks/usePlayer';
import useIsPaused from '@/hooks/useIsPaused';
import { useOnboardingSync } from '@/hooks/useOnboardingSync';
import { extractContractErrorKey } from '@/lib/contractErrorMessage';
import { buildRegisterPlayer } from '@/lib/contract';
import { submitSignedTransaction, isNetworkError } from '@/lib/sorobanRpc';
import {
  trackUploadedCid,
  matchTrackedUpload,
} from '@/lib/uploadTrackingClient';
import Button from '@/components/ui/Button';
import type { PlayerVitals } from '@/types';
import type { TxStatus } from '@/components/ui/TransactionStatus';
import StepIndicator from './onboarding/StepIndicator';
import PersonalInfoStep from './onboarding/steps/PersonalInfoStep';
import HighlightReelStep from './onboarding/steps/HighlightReelStep';
import ReviewStep from './onboarding/steps/ReviewStep';
import {
  STEPS,
  INITIAL_WIZARD_DATA,
  isStepId,
  stepReducer,
  validateField,
  validateBasicInfo,
  validateHighlightReel,
} from './onboarding/wizardState';
import type { StepId, WizardData } from './onboarding/wizardState';
import {
  loadPersistedWizardState,
  savePersistedWizardState,
  clearPersistedWizardState,
} from './onboarding/wizardStorage';

export interface PlayerOnboardingWizardProps {
  onSuccess: (result: {
    playerId: string;
    vitals: PlayerVitals;
    ipfsHash: string;
  }) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PlayerOnboardingWizard({
  onSuccess,
}: PlayerOnboardingWizardProps) {
  const { publicKey, signOnly } = useWallet();
  const { player, loading: playerLoading } = usePlayer(publicKey);
  const isPaused = useIsPaused();
  const tErrors = useTranslations('contractErrors');
  const tContractStatus = useTranslations('contract_status');

  // Background sync for the final submit step (issue #1181): if signing
  // succeeds but broadcasting the transaction fails for a network reason,
  // the signed submission is queued here instead of being lost — see
  // hooks/useOnboardingSync.ts for how it gets resubmitted automatically.
  const onboardingSync = useOnboardingSync(publicKey);

  const [step, dispatchStep] = useReducer(stepReducer, 1 as StepId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  // Whether a highlight-reel upload is currently in flight (see #1184) —
  // used to keep "Continue"/"Register" disabled for the full duration of an
  // upload, not just until the CID field happens to be re-populated.
  const [isUploadInProgress, setIsUploadInProgress] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const nationalityRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLSelectElement>(null);
  const positionRef = useRef<HTMLSelectElement>(null);
  const step2SummaryRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(step);
  const [step2FocusTrigger, setStep2FocusTrigger] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  // Focus the step 2 summary after it mounts (element is conditionally rendered)
  useEffect(() => {
    if (step2FocusTrigger > 0) {
      step2SummaryRef.current?.focus();
    }
  }, [step2FocusTrigger]);

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    stepHeadingRef.current?.focus();
    setAnnouncement(
      `Step ${step} of ${STEPS.length}: ${STEPS[step - 1]?.label ?? ''}`,
    );
  }, [step]);

  const [data, setData] = useState<WizardData>(INITIAL_WIZARD_DATA);
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false);

  // Restore wizard progress (including an already-uploaded CID) once the
  // wallet is known. Runs once per wallet — a reload at any step, including
  // after step 2's upload completes, picks up where it left off instead of
  // forcing a re-upload.
  useEffect(() => {
    if (!publicKey) return;
    const saved = loadPersistedWizardState(publicKey);
    if (saved) {
      setData(saved.data);
      if (isStepId(saved.step)) {
        dispatchStep({ type: 'GOTO', step: saved.step });
      }
    }
    setHydratedFromStorage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  // Persist on every change, but only after the restore effect above has
  // run — otherwise the initial blank state would overwrite (and lose)
  // whatever was already saved before restore gets a chance to read it.
  useEffect(() => {
    if (!publicKey || !hydratedFromStorage) return;
    savePersistedWizardState(publicKey, { step, data });
  }, [publicKey, hydratedFromStorage, step, data]);

  // A background sync (issue #1181) may have completed while this tab — or
  // the whole app — was closed. On mount/wallet-change, if IndexedDB says
  // this wallet's queued submission finished, treat it exactly like a
  // just-finished in-tab submission: hand it to onSuccess (so the parent
  // shows the registered profile instead of a stale pending state) and
  // clear the record so this doesn't fire again on a later remount.
  const onboardingSyncSubmission = onboardingSync.submission;
  useEffect(() => {
    if (!onboardingSync.loaded || !onboardingSyncSubmission) return;
    if (onboardingSyncSubmission.status === 'complete') {
      onSuccess({
        playerId: onboardingSyncSubmission.wallet,
        vitals: onboardingSyncSubmission.vitals,
        ipfsHash: onboardingSyncSubmission.ipfsHash,
      });
      onboardingSync.discard();
    } else if (!playerLoading && player) {
      // A profile already exists (e.g. this wallet registered through some
      // other path) but a stale queued/failed record is still sitting in
      // IndexedDB — nothing left for it to do.
      onboardingSync.discard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingSync.loaded, onboardingSyncSubmission, playerLoading, player]);

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

  const validateStep1 = (): boolean => {
    const errs = validateBasicInfo(data);
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

  // Called when VideoUpload's upload completes. Superseding a previous CID
  // (re-uploading at step 2) is handled naturally here — `data.ipfsHash` is
  // overwritten, not appended, so only the latest CID is ever submitted
  // with registration. The superseded CID's backend tracking record (see
  // trackUploadedCid below) is left as-is: it's now genuinely orphaned —
  // this wizard will never reference it again — so leaving it unmatched is
  // exactly what makes it a correct cleanup candidate later, not a bug.
  const handleVideoUpload = (cid: string) => {
    updateField('ipfsHash', cid);
    trackUploadedCid({
      cid,
      wallet: publicKey ?? null,
      context: 'player_onboarding_highlight_reel',
    });
  };

  // Fires the instant a new (re-)upload begins — including replacing an
  // already-uploaded, already-verified CID from an earlier attempt at step
  // 2. Clearing `ipfsHash` immediately (rather than waiting for the new
  // upload to finish) is what closes the race in issue #1184: for as long
  // as a replacement upload is in flight, `data.ipfsHash` is empty, so
  // `validateStep2` — and therefore "Continue" — cannot be satisfied by the
  // stale CID from the previous upload. Only the new upload's own
  // `handleVideoUpload` call can repopulate it.
  const handleVideoUploadStart = () => {
    updateField('ipfsHash', '');
  };

  const validateStep2 = (): boolean => {
    const errs = validateHighlightReel(data.ipfsHash, isUploadInProgress);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
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
    dispatchStep({ type: 'NEXT' });
  };

  const handleBack = () => {
    setErrors({});
    setValidationAttempted(false);
    dispatchStep({ type: 'BACK' });
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
    // Belt-and-suspenders guard mirroring validateStep2: step 3 can only be
    // reached through a successful validateStep2 call, but this closes the
    // gap defensively in case that ever changes, rather than trusting that
    // step 3 is unreachable any other way (see issue #1184).
    if (isUploadInProgress || !data.ipfsHash) {
      setErrors({
        form: 'Please finish uploading your highlight reel before submitting',
      });
      dispatchStep({ type: 'GOTO', step: 2 });
      return;
    }

    setIsLoading(true);
    setErrors({});
    setTxStatus('pending');
    setTxHash(null);
    setAnnouncement('Waiting for signature in your wallet…');

    try {
      const vitals: PlayerVitals = {
        name: data.name,
        age: parseInt(data.age),
        position: data.position,
        region: data.region,
        nationality: data.nationality,
      };

      const xdr = await buildRegisterPlayer(publicKey, vitals, data.ipfsHash);

      // Signing happens locally via the wallet extension and needs no
      // network — only the broadcast below can fail due to connectivity.
      // Splitting the two (rather than one combined sign-and-submit call)
      // is what makes it possible to queue the *signed* transaction for
      // background sync when broadcasting is what actually drops.
      const signedXdr = await signOnly(xdr);
      setAnnouncement('Signature received. Submitting your registration…');

      let hash: string;
      try {
        const result = await submitSignedTransaction(signedXdr);
        hash = result.hash;
      } catch (broadcastError) {
        if (isNetworkError(broadcastError)) {
          // Connectivity dropped between signing and broadcasting — the
          // signed transaction is durable now (IndexedDB), and a
          // background sync (or the in-tab fallback) will finish
          // submitting it automatically. Nothing more to do here.
          await onboardingSync.queueSubmission({
            vitals,
            ipfsHash: data.ipfsHash,
            signedXdr,
          });
          setTxStatus(null);
          clearPersistedWizardState(publicKey);
          return;
        }
        throw broadcastError;
      }

      setTxHash(hash);
      setTxStatus('success');
      setAnnouncement('Registration submitted successfully.');

      matchTrackedUpload({ cid: data.ipfsHash, txHash: hash });
      clearPersistedWizardState(publicKey);

      onSuccess({ playerId: publicKey, vitals, ipfsHash: data.ipfsHash });
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
      setAnnouncement(
        contractKey
          ? tErrors(contractKey)
          : (rawMessage ?? 'Registration failed. Please try again.'),
      );
      window.requestAnimationFrame(() => {
        document.getElementById('wizard-register-button')?.focus();
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!playerLoading && player) {
    return (
      <div
        role="alert"
        className="rounded-md border border-yellow-500 bg-yellow-950/30 p-4 text-center"
      >
        <p className="text-sm text-yellow-400 font-medium">
          A profile already exists for this wallet. You cannot register again.
        </p>
      </div>
    );
  }

  // A signed submission is queued for background sync — the multi-step
  // form no longer applies (there's nothing left to edit; it's already
  // signed) so show its status instead. 'complete' isn't handled here: the
  // effect above hands it to onSuccess and clears the record on the same
  // render pass it appears, so this component typically never paints it.
  if (
    onboardingSyncSubmission &&
    (onboardingSyncSubmission.status === 'pending' ||
      onboardingSyncSubmission.status === 'syncing')
  ) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-3 text-center"
      >
        <p className="text-sm text-yellow-300 font-medium">
          Your registration is signed and queued for submission.
        </p>
        <p className="text-sm text-gray-400">
          It will finish automatically once you&apos;re back online — even if
          you close this tab or the app.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            type="button"
            variant="secondary"
            onClick={onboardingSync.retryNow}
            disabled={onboardingSyncSubmission.status === 'syncing'}
          >
            Try now
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onboardingSync.discard}
          >
            Discard and start over
          </Button>
        </div>
      </div>
    );
  }

  if (onboardingSyncSubmission?.status === 'failed') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-500 bg-red-950/30 p-4 space-y-3 text-center"
      >
        <p className="text-sm text-red-400 font-medium">
          Registration could not be completed
          {onboardingSyncSubmission.lastError
            ? `: ${onboardingSyncSubmission.lastError}`
            : '.'}
        </p>
        <div className="flex gap-3 justify-center">
          <Button type="button" onClick={onboardingSync.retryNow}>
            Retry
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onboardingSync.discard}
          >
            Discard and start over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <StepIndicator currentStep={step} />

      {step === 1 && (
        <PersonalInfoStep
          data={data}
          errors={errors}
          validationAttempted={validationAttempted}
          isValid={isStep1Valid}
          headingRef={stepHeadingRef}
          nameRef={nameRef}
          ageRef={ageRef}
          nationalityRef={nationalityRef}
          regionRef={regionRef}
          positionRef={positionRef}
          onChange={handleChange}
          onBlur={handleBlur}
          onNext={handleNext}
        />
      )}

      {step === 2 && (
        <HighlightReelStep
          ipfsHash={data.ipfsHash}
          error={errors.ipfsHash}
          validationAttempted={validationAttempted}
          isUploadInProgress={isUploadInProgress}
          headingRef={stepHeadingRef}
          summaryRef={step2SummaryRef}
          onUpload={handleVideoUpload}
          onUploadStart={handleVideoUploadStart}
          onUploadingChange={setIsUploadInProgress}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {step === 3 && (
        <ReviewStep
          data={data}
          txStatus={txStatus}
          txHash={txHash}
          formError={errors.form}
          isLoading={isLoading}
          submitDisabledReason={
            isPaused ? tContractStatus('paused_hint') : undefined
          }
          headingRef={stepHeadingRef}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
