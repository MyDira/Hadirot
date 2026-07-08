import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MediaUploader } from '../../../../components/shared/MediaUploader';
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import { DESCRIPTION_PLACEHOLDERS } from '../../../postCommercial/typeFieldConfigs';
import type { CommercialSpaceType } from '../../../../config/supabase';
import type { CommercialStepProps } from './_StepShell';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Photos & Description',
  bullets: [
    'Lead with your best exterior / storefront shot — it drives the most clicks.',
    'Include wide interior shots, the layout, frontage, and any build-out or fixtures.',
    'Aim for 5–10 well-lit photos; listings with more photos get more inquiries.',
    'In the description, call out condition, ceiling height, frontage, and ideal uses.',
  ],
};

interface Props extends CommercialStepProps {
  mediaFiles: MediaFile[];
  uploadingMedia: boolean;
  onMediaAdd: (files: File[]) => void;
  onMediaRemove: (id: string) => void;
  onSetFeatured: (id: string) => void;
  maxAllowedFiles: number;
}

export function Step2CommercialShowItOff({
  formData,
  updateFormData,
  onNext,
  onBack,
  mediaFiles,
  uploadingMedia,
  onMediaAdd,
  onMediaRemove,
  onSetFeatured,
  maxAllowedFiles,
}: Props) {
  const photoCount = mediaFiles.filter(m => m.type === 'image').length;
  const canContinue = photoCount >= 1 && !uploadingMedia;

  const placeholder = formData.commercial_space_type
    ? DESCRIPTION_PLACEHOLDERS[formData.commercial_space_type as CommercialSpaceType]
    : 'Describe the space — layout, finishes, condition, standout features…';

  return (
    <div className="flex gap-8 items-start">
    <div className="flex-1 min-w-0 space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Photos <span className="text-red-500">*</span>
        </h2>
        <p className="text-sm text-gray-500 mb-5">Required — at least 1 photo</p>

        <MediaUploader
          mediaFiles={mediaFiles}
          onMediaAdd={onMediaAdd as any}
          onMediaRemove={onMediaRemove}
          onSetFeatured={onSetFeatured}
          maxFiles={maxAllowedFiles}
          minFiles={1}
          uploading={uploadingMedia}
        />

        {photoCount === 0 && (
          <p className="mt-3 text-xs text-amber-700 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Add at least one photo to continue
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Listing Details</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Listing Title
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional — auto-generated if blank)</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => updateFormData({ title: e.target.value })}
              placeholder="e.g. Prime Avenue J retail with 25ft frontage"
              maxLength={120}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={e => updateFormData({ description: e.target.value })}
              rows={6}
              placeholder={placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Video URL
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional — YouTube, Vimeo, Matterport…)</span>
            </label>
            <input
              type="url"
              value={formData.video_url || ''}
              onChange={e => updateFormData({ video_url: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadingMedia ? 'Uploading…' : (<>Continue <ArrowRight className="w-4 h-4" /></>)}
        </button>
      </div>
    </div>
    <StepTips {...TIPS} />
    </div>
  );
}
