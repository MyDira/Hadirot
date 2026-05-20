import React from 'react';
import { StepShell, type CommercialStepProps } from './_StepShell';

export function Step5CommercialOptionalDetails({ isSale, onNext, onBack }: CommercialStepProps) {
  // Phase 5 will implement: collapsible Building Details + (lease) LeaseTermsSection or (sale) SaleFinancialsSection.
  return (
    <StepShell title="Optional Details" onBack={onBack} onNext={onNext}>
      <p className="text-sm text-gray-500">
        Step 5 placeholder — building details and {isSale ? 'sale financials' : 'lease terms'} land here in Phase 5. All optional.
      </p>
    </StepShell>
  );
}
