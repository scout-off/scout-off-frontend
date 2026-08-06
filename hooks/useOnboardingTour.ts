import { useState, useEffect, useCallback } from 'react';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface TourState {
  currentStep: number;
  isVisible: boolean;
  isDismissed: boolean;
  isCompleted: boolean;
}

const STORAGE_PREFIX = 'scout_tour_';

export function useOnboardingTour(
  tourId: string,
  steps: TourStep[],
  walletAddress?: string,
) {
  const [state, setState] = useState<TourState>({
    currentStep: 0,
    isVisible: false,
    isDismissed: false,
    isCompleted: false,
  });

  const storageKey = `${STORAGE_PREFIX}${tourId}_${walletAddress || 'anon'}`;

  // Initialize tour state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.isDismissed || parsed.isCompleted) {
        setState((prev) => ({
          ...prev,
          isDismissed: parsed.isDismissed,
          isCompleted: parsed.isCompleted,
        }));
      } else {
        setState((prev) => ({ ...prev, isVisible: true }));
      }
    } else {
      // Show tour for first-time users
      setState((prev) => ({ ...prev, isVisible: true }));
    }
  }, [storageKey]);

  const saveTourState = useCallback(
    (newState: TourState) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          isDismissed: newState.isDismissed,
          isCompleted: newState.isCompleted,
        }),
      );
    },
    [storageKey],
  );

  const nextStep = useCallback(() => {
    setState((prev) => {
      const newStep = prev.currentStep + 1;
      const newState = {
        ...prev,
        currentStep: Math.min(newStep, steps.length - 1),
      };

      if (newStep >= steps.length) {
        newState.isCompleted = true;
        newState.isVisible = false;
        saveTourState(newState);
      }

      return newState;
    });
  }, [steps.length, saveTourState]);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0),
    }));
  }, []);

  const dismissTour = useCallback(() => {
    setState((prev) => {
      const newState = {
        ...prev,
        isDismissed: true,
        isVisible: false,
      };
      saveTourState(newState);
      return newState;
    });
  }, [saveTourState]);

  const skipTour = useCallback(() => {
    dismissTour();
  }, [dismissTour]);

  const completeTour = useCallback(() => {
    setState((prev) => {
      const newState = {
        ...prev,
        isCompleted: true,
        isVisible: false,
      };
      saveTourState(newState);
      return newState;
    });
  }, [saveTourState]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(storageKey);
    setState({
      currentStep: 0,
      isVisible: true,
      isDismissed: false,
      isCompleted: false,
    });
  }, [storageKey]);

  const currentStepData = steps[state.currentStep];

  return {
    ...state,
    currentStep: state.currentStep,
    currentStepData,
    steps,
    nextStep,
    prevStep,
    dismissTour,
    skipTour,
    completeTour,
    resetTour,
  };
}
