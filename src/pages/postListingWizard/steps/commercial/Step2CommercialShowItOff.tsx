import React from 'react';
import { StepShell, type CommercialStepProps } from './_StepShell';
import type { MediaFile } from '../../../../components/shared/MediaUploader';

interface Props extends CommercialStepProps {
  mediaFiles: MediaFile[];
  uploadingMedia: boolean;
  onMediaAdd: (files: File[]) => void;
  onMediaRemove: (id: string) => void;
  onSetFeatured: (id: string) => void;
  maxAllowedFiles: number;
}

export function Step2CommercialShowItOff({ onNext, onBack }: Props) {
  // Phase 2 will implement: media uploader, description with type-specific placeholder, optional title, video_url.
  return (
    <StepShell title="Photos & Description" onBack={onBack} onNext={onNext}>
      <p className="text-sm text-gray-500">
        Step 2 placeholder — photos, description, and optional video land here in Phase 2.
      </p>
    </StepShell>
  );
}
