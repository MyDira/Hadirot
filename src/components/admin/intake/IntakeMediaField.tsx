import { AlertCircle } from 'lucide-react';
import type { IntakeImage } from '@/config/supabase';
import { MediaUploader } from '@/components/shared/MediaUploader';
import { intakeImagesToMediaFiles, useIntakeMedia } from './useIntakeMedia';

interface IntakeMediaFieldProps {
  adminId: string | null | undefined;
  images: IntakeImage[];
  onChange: (images: IntakeImage[]) => void;
  label: string;
  maxFiles?: number;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  deleteOnRemove?: boolean;
}

/** Photo + video attachment field for the AI intake flow — same drag-and-drop uploader the listing forms use. */
export function IntakeMediaField({
  adminId,
  images,
  onChange,
  label,
  maxFiles = 11,
  disabled = false,
  onUploadingChange,
  deleteOnRemove = true,
}: IntakeMediaFieldProps) {
  const { error, uploading, handleMediaAdd, handleMediaRemove, handleSetFeatured } = useIntakeMedia({
    adminId,
    images,
    onChange,
    maxFiles,
    onUploadingChange,
    deleteOnRemove,
  });

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-2 block">{label}</label>
      {error && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <MediaUploader
        mediaFiles={intakeImagesToMediaFiles(images)}
        onMediaAdd={handleMediaAdd}
        onMediaRemove={handleMediaRemove}
        onSetFeatured={handleSetFeatured}
        maxFiles={maxFiles}
        disabled={disabled}
        uploading={uploading}
      />
    </div>
  );
}
