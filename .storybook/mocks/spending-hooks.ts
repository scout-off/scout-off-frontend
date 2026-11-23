// Storybook stand-ins for hooks/useSpendingSummary.ts and
// hooks/useFeeDriftDetection.ts (aliased in .storybook/main.ts). The real
// hooks need a WalletProvider, the indexer and a contract RPC; stories set
// the returned state per story via the setters below instead.
import type { FeeDriftState } from '@/hooks/useFeeDriftDetection';
import type { SpendingSummaryData } from '@/hooks/useSpendingSummary';

interface SpendingSummaryState {
  data: SpendingSummaryData | null;
  loading: boolean;
  error: string | null;
}

let spendingState: SpendingSummaryState = {
  data: null,
  loading: false,
  error: null,
};

export function setMockSpendingSummary(state: SpendingSummaryState) {
  spendingState = state;
}

export function useSpendingSummary(): SpendingSummaryState {
  return spendingState;
}

export function useFeeDriftDetection(): FeeDriftState {
  return {
    hasDrift: false,
    liveContactFee: null,
    expectedContactFee: 0,
    warningMessage: null,
    loading: false,
    error: null,
    refetch: () => {},
  };
}
