/**
 * Typed step state machine, wizard data model and pure validation for
 * PlayerOnboardingWizard (issue #1517). Everything here is free of React
 * component concerns so it can be unit-tested directly.
 */

export const STEPS = [
  { id: 1, label: 'Personal Info' },
  { id: 2, label: 'Highlight Reel' },
  { id: 3, label: 'Review & Confirm' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export const TOTAL_STEPS: number = STEPS.length;

export function isStepId(value: number): value is StepId {
  return STEPS.some((s) => s.id === value);
}

export type StepAction =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GOTO'; step: StepId };

/** Pure transition function: NEXT/BACK are clamped to the valid step range. */
export function stepReducer(current: StepId, action: StepAction): StepId {
  switch (action.type) {
    case 'NEXT': {
      const next = current + 1;
      return isStepId(next) ? next : current;
    }
    case 'BACK': {
      const prev = current - 1;
      return isStepId(prev) ? prev : current;
    }
    case 'GOTO':
      return action.step;
    default:
      return current;
  }
}

export interface WizardData {
  name: string;
  age: string;
  nationality: string;
  region: string;
  position: string;
  bio: string;
  ipfsHash: string;
}

export const INITIAL_WIZARD_DATA: WizardData = {
  name: '',
  age: '',
  nationality: '',
  region: '',
  position: '',
  bio: '',
  ipfsHash: '',
};

// ── Validation ───────────────────────────────────────────────────────────────

export function validateField(
  field: keyof WizardData,
  value: string,
): string | undefined {
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
      if (isNaN(n) || n < 14 || n > 45) return 'Age must be between 14 and 45';
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
}

const BASIC_INFO_FIELDS = [
  'name',
  'age',
  'nationality',
  'region',
  'position',
] as const;

/** Errors for step 1, keyed by field name. Empty when the step is valid. */
export function validateBasicInfo(data: WizardData): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const field of BASIC_INFO_FIELDS) {
    const msg = validateField(field, data[field]);
    if (msg) errs[field] = msg;
  }
  return errs;
}

export function isBasicInfoValid(data: WizardData): boolean {
  return Object.keys(validateBasicInfo(data)).length === 0;
}

/** Errors for step 2 (highlight reel). Empty when the step is valid. */
export function validateHighlightReel(
  ipfsHash: string,
  isUploadInProgress: boolean,
): Record<string, string> {
  if (isUploadInProgress) {
    return { ipfsHash: 'Please wait for the highlight reel upload to finish' };
  }
  if (!ipfsHash) {
    return { ipfsHash: 'Please upload your highlight reel before continuing' };
  }
  return {};
}

export function formatShortCid(ipfsHash: string): string {
  return ipfsHash ? `${ipfsHash.slice(0, 8)}…${ipfsHash.slice(-6)}` : '';
}
