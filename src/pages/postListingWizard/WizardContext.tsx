import { createContext, useContext } from 'react';

interface WizardUIContextValue {
  currentStep: number;
  totalSteps: number;
  lastSavedAt: Date | null;
}

export const WizardUIContext = createContext<WizardUIContextValue>({
  currentStep: 0,
  totalSteps: 6,
  lastSavedAt: null,
});

export function useWizardUI() {
  return useContext(WizardUIContext);
}
