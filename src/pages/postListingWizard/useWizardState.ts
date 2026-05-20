import { useState, useEffect, useCallback } from 'react';
import type { ListingFormData } from '../postListing/types';
import { INITIAL_FORM_DATA } from '../postListing/types';
import type { CommercialListingFormData } from '../postCommercial/commercialTypes';
import { INITIAL_COMMERCIAL_FORM_DATA } from '../postCommercial/commercialTypes';
import type { GoogleStreetFeature } from '../../components/listing/GoogleStreetAutocomplete';

export type WizardPath =
  | 'residential_rent'
  | 'residential_sale'
  | 'commercial_lease'
  | 'commercial_sale'
  | 'concierge';

export const RESIDENTIAL_RENT_STEPS = 6;
export const RESIDENTIAL_SALE_STEPS = 6;
export const COMMERCIAL_STEPS = 6;

export function isCommercialPath(path: WizardPath | null): boolean {
  return path === 'commercial_lease' || path === 'commercial_sale';
}

interface PersistedState {
  selectedPath: WizardPath | null;
  currentStep: number;
  /** Furthest step the user has ever reached by pressing Continue. */
  highWaterStep: number;
  formData: ListingFormData;
  commercialFormData?: CommercialListingFormData;
  crossStreetAFeature: GoogleStreetFeature | null;
  crossStreetBFeature: GoogleStreetFeature | null;
  neighborhoodSelectValue: string;
  customNeighborhoodInput: string;
}

function loadFromStorage(userId: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(`wizard_draft_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function saveToStorage(userId: string, state: PersistedState) {
  try {
    localStorage.setItem(`wizard_draft_${userId}`, JSON.stringify(state));
  } catch {
    // storage full or private mode — silently ignore
  }
}

function clearStorage(userId: string) {
  try {
    localStorage.removeItem(`wizard_draft_${userId}`);
  } catch {
    // ignore
  }
}

const RENTAL_INITIAL: ListingFormData = {
  ...INITIAL_FORM_DATA,
  listing_type: 'rental',
};

const SALE_INITIAL: ListingFormData = {
  ...INITIAL_FORM_DATA,
  listing_type: 'sale',
  sale_status: 'available',
  parking: 'no',
};

const COMMERCIAL_LEASE_INITIAL: CommercialListingFormData = {
  ...INITIAL_COMMERCIAL_FORM_DATA,
  listing_type: 'rental',
};

const COMMERCIAL_SALE_INITIAL: CommercialListingFormData = {
  ...INITIAL_COMMERCIAL_FORM_DATA,
  listing_type: 'sale',
};

export function useWizardState(userId: string | null) {
  const [selectedPath, setSelectedPathRaw] = useState<WizardPath | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [highWaterStep, setHighWaterStep] = useState(0);
  const [formData, setFormData] = useState<ListingFormData>(RENTAL_INITIAL);
  const [commercialFormData, setCommercialFormData] = useState<CommercialListingFormData>(COMMERCIAL_LEASE_INITIAL);
  const [crossStreetAFeature, setCrossStreetAFeature] = useState<GoogleStreetFeature | null>(null);
  const [crossStreetBFeature, setCrossStreetBFeature] = useState<GoogleStreetFeature | null>(null);
  const [neighborhoodSelectValue, setNeighborhoodSelectValue] = useState('');
  const [customNeighborhoodInput, setCustomNeighborhoodInput] = useState('');
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    if (!userId) { setInitialized(true); return; }
    const saved = loadFromStorage(userId);
    if (saved) {
      setSelectedPathRaw(saved.selectedPath);
      setCurrentStep(saved.currentStep);
      setHighWaterStep(saved.highWaterStep ?? saved.currentStep);
      setFormData(saved.formData);
      if (saved.commercialFormData) {
        setCommercialFormData(saved.commercialFormData);
      }
      setCrossStreetAFeature(saved.crossStreetAFeature);
      setCrossStreetBFeature(saved.crossStreetBFeature);
      setNeighborhoodSelectValue(saved.neighborhoodSelectValue);
      setCustomNeighborhoodInput(saved.customNeighborhoodInput);
    }
    setInitialized(true);
  }, [userId]);

  // Persist to storage whenever relevant state changes
  useEffect(() => {
    if (!initialized || !userId) return;
    saveToStorage(userId, {
      selectedPath,
      currentStep,
      highWaterStep,
      formData,
      commercialFormData,
      crossStreetAFeature,
      crossStreetBFeature,
      neighborhoodSelectValue,
      customNeighborhoodInput,
    });
    setLastSavedAt(new Date());
  }, [initialized, userId, selectedPath, currentStep, highWaterStep, formData, commercialFormData, crossStreetAFeature, crossStreetBFeature, neighborhoodSelectValue, customNeighborhoodInput]);

  // heat ↔ utilities_included bidirectional sync (verbatim from PostListing.tsx)
  useEffect(() => {
    if (formData.listing_type === 'rental') {
      const hasHeatIncluded = formData.utilities_included?.includes('heat');
      const currentHeatValue = formData.heat;
      if (hasHeatIncluded && currentHeatValue !== 'included') {
        setFormData(prev => ({ ...prev, heat: 'included' }));
      } else if (!hasHeatIncluded && currentHeatValue === 'included') {
        setFormData(prev => ({ ...prev, heat: 'tenant_pays' }));
      }
    }
  }, [formData.listing_type, formData.utilities_included, formData.heat]);

  const updateFormData = useCallback((updates: Partial<ListingFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const updateCommercialFormData = useCallback((updates: Partial<CommercialListingFormData>) => {
    setCommercialFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const setSelectedPath = useCallback((path: WizardPath | null) => {
    setSelectedPathRaw(path);
    setCurrentStep(0);
    setIsLocationConfirmed(false);
    if (path === 'residential_rent') {
      setFormData({ ...RENTAL_INITIAL });
      setCrossStreetAFeature(null);
      setCrossStreetBFeature(null);
      setNeighborhoodSelectValue('');
      setCustomNeighborhoodInput('');
    } else if (path === 'residential_sale') {
      setFormData({ ...SALE_INITIAL });
      setCrossStreetAFeature(null);
      setCrossStreetBFeature(null);
      setNeighborhoodSelectValue('');
      setCustomNeighborhoodInput('');
    } else if (path === 'commercial_lease') {
      setCommercialFormData({ ...COMMERCIAL_LEASE_INITIAL });
      setCrossStreetAFeature(null);
      setCrossStreetBFeature(null);
      setNeighborhoodSelectValue('');
      setCustomNeighborhoodInput('');
    } else if (path === 'commercial_sale') {
      setCommercialFormData({ ...COMMERCIAL_SALE_INITIAL });
      setCrossStreetAFeature(null);
      setCrossStreetBFeature(null);
      setNeighborhoodSelectValue('');
      setCustomNeighborhoodInput('');
    }
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep(s => {
      const next = s + 1;
      // Advance the high-water mark when the user completes a new step.
      setHighWaterStep(hw => Math.max(hw, next));
      return next;
    });
  }, []);
  const prevStep = useCallback(() => setCurrentStep(s => Math.max(0, s - 1)), []);
  const goToStep = useCallback((n: number) => setCurrentStep(n), []);

  const clearDraft = useCallback(() => {
    if (userId) clearStorage(userId);
    setSelectedPathRaw(null);
    setCurrentStep(0);
    setHighWaterStep(0);
    setFormData(RENTAL_INITIAL);
    setCommercialFormData(COMMERCIAL_LEASE_INITIAL);
    setCrossStreetAFeature(null);
    setCrossStreetBFeature(null);
    setNeighborhoodSelectValue('');
    setCustomNeighborhoodInput('');
    setIsLocationConfirmed(false);
  }, [userId]);

  const resolvedNeighborhood =
    neighborhoodSelectValue === 'other'
      ? customNeighborhoodInput.trim()
      : neighborhoodSelectValue;

  return {
    initialized,
    selectedPath,
    setSelectedPath,
    currentStep,
    highWaterStep,
    nextStep,
    prevStep,
    goToStep,
    formData,
    updateFormData,
    setFormData,
    commercialFormData,
    updateCommercialFormData,
    setCommercialFormData,
    crossStreetAFeature,
    setCrossStreetAFeature,
    crossStreetBFeature,
    setCrossStreetBFeature,
    neighborhoodSelectValue,
    setNeighborhoodSelectValue,
    customNeighborhoodInput,
    setCustomNeighborhoodInput,
    isLocationConfirmed,
    setIsLocationConfirmed,
    resolvedNeighborhood,
    setHighWaterStep,
    clearDraft,
    lastSavedAt,
  };
}
