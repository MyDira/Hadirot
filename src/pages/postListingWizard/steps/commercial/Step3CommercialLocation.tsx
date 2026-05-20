import React from 'react';
import { StepShell, type CommercialStepProps } from './_StepShell';
import type { GoogleStreetFeature } from '../../../../components/listing/GoogleStreetAutocomplete';

interface Props extends CommercialStepProps {
  crossStreetAFeature: GoogleStreetFeature | null;
  setCrossStreetAFeature: (f: GoogleStreetFeature | null) => void;
  crossStreetBFeature: GoogleStreetFeature | null;
  setCrossStreetBFeature: (f: GoogleStreetFeature | null) => void;
  neighborhoodSelectValue: string;
  setNeighborhoodSelectValue: (v: string) => void;
  customNeighborhoodInput: string;
  setCustomNeighborhoodInput: (v: string) => void;
  isLocationConfirmed: boolean;
  setIsLocationConfirmed: (b: boolean) => void;
}

export function Step3CommercialLocation({ onNext, onBack }: Props) {
  // Phase 3 will implement: address vs cross-streets toggle, neighborhood, Mapbox confirmation.
  return (
    <StepShell title="Location" onBack={onBack} onNext={onNext}>
      <p className="text-sm text-gray-500">
        Step 3 placeholder — address or cross-streets, neighborhood, and map confirmation land here in Phase 3.
      </p>
    </StepShell>
  );
}
