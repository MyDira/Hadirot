import React from 'react';
import { StepShell, type CommercialStepProps } from './_StepShell';

export function Step1CommercialTypeAndPricing({ formData, updateFormData, isSale, onNext, onBack }: CommercialStepProps) {
  // Phase 1 will implement: TypeSelector + subtype + available_sf + price/asking_price + call_for_price.
  return (
    <StepShell title="Type & Pricing" onBack={onBack} onNext={onNext}>
      <p className="text-sm text-gray-500">
        Step 1 placeholder — {isSale ? 'Commercial Sale' : 'Commercial Rental'}.
        Type selector, available SF, and pricing land here in Phase 1.
      </p>
    </StepShell>
  );
}
