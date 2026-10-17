import type { WizardData } from './wizardState';

/**
 * Persists wizard progress (issue #1005) across a reload within the same
 * browser tab/session — sessionStorage, not localStorage, since this is
 * scoped to "resume where you left off in this session," not a
 * cross-session draft. Keyed per wallet so switching wallets never leaks
 * one player's in-progress data (including an already-obtained IPFS CID)
 * into another's form.
 */
const WIZARD_STORAGE_PREFIX = 'scoutoff_onboarding_wizard_';

function wizardStorageKey(wallet: string): string {
  return `${WIZARD_STORAGE_PREFIX}${wallet}`;
}

export interface PersistedWizardState {
  step: number;
  data: WizardData;
}

export function loadPersistedWizardState(
  wallet: string,
): PersistedWizardState | null {
  try {
    const raw = sessionStorage.getItem(wizardStorageKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWizardState>;
    if (!parsed.data || typeof parsed.step !== 'number') return null;
    return parsed as PersistedWizardState;
  } catch {
    return null; // Corrupt or unavailable storage — start fresh silently.
  }
}

export function savePersistedWizardState(
  wallet: string,
  state: PersistedWizardState,
): void {
  try {
    sessionStorage.setItem(wizardStorageKey(wallet), JSON.stringify(state));
  } catch {
    // Storage unavailable (e.g. private browsing) — resume-on-reload just
    // won't work this session; the wizard itself still works normally.
  }
}

export function clearPersistedWizardState(wallet: string): void {
  try {
    sessionStorage.removeItem(wizardStorageKey(wallet));
  } catch {
    // Nothing to clean up if storage was never usable.
  }
}
