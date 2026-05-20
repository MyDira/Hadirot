import React from 'react';
import { StepShell, type CommercialStepProps } from './_StepShell';
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import type { Profile } from '../../../../config/supabase';

interface Props extends CommercialStepProps {
  mediaFiles: MediaFile[];
  resolvedNeighborhood: string;
  loading: boolean;
  uploadingMedia: boolean;
  submitError: string | null;
  onSubmit: () => void;
  profile: Profile | null;
}

export function Step6CommercialContactAndReview({ onBack, onSubmit, loading, submitError }: Props) {
  // Phase 6 will implement: contact prefill, admin_listing_type_display, review summary, terms_agreed, submit.
  return (
    <StepShell
      title="Contact & Review"
      onBack={onBack}
      onNext={onSubmit}
      isSubmit
      submitLabel="Submit Listing"
      submitting={loading}
    >
      <p className="text-sm text-gray-500">
        Step 6 placeholder — contact info, review summary, terms agreement, and submit land here in Phase 6.
      </p>
      {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
    </StepShell>
  );
}
