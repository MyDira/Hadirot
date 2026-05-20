import React from 'react';
import { StepShell, type CommercialStepProps } from './_StepShell';

export function Step4CommercialSpaceDetails({ onNext, onBack }: CommercialStepProps) {
  // Phase 4 will implement: TYPE_SPECIFIC_FIELDS renderer + ceiling_height_ft + floor_level + lease_type + build_out_condition.
  return (
    <StepShell title="Space Details" onBack={onBack} onNext={onNext}>
      <p className="text-sm text-gray-500">
        Step 4 placeholder — type-specific fields, ceiling height, floor level, lease type, and build-out condition land here in Phase 4.
      </p>
    </StepShell>
  );
}
