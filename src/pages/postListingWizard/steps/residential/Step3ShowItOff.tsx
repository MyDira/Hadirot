import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { MediaUploader } from '../../../../components/shared/MediaUploader';
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Photos & Description',
  bullets: [
    'Photos make a significant difference in inquiries — the more the better, up to 10.',
    'Include living room, bedroom, kitchen, and bathroom for best results.',
    'Your first photo is the listing thumbnail — make it count.',
  ],
};

interface Step3Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  mediaFiles: MediaFile[];
  uploadingMedia: boolean;
  onMediaAdd: (files: File[]) => Promise<void>;
  onMediaRemove: (id: string) => void;
  onSetFeatured: (id: string) => void;
  maxAllowedFiles: number;
}

export function Step3ShowItOff({
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
}: Step3Props) {
  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        {/* Photos first */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Photos</h2>
          <p className="text-sm text-gray-500 mb-5">Optional — a stock photo will be used if none are uploaded</p>

          <MediaUploader
            mediaFiles={mediaFiles}
            onMediaAdd={onMediaAdd}
            onMediaRemove={onMediaRemove}
            onSetFeatured={onSetFeatured}
            maxFiles={maxAllowedFiles}
            uploading={uploadingMedia}
          />
        </div>

        {/* Listing details below */}
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
                placeholder="e.g. Bright 2BR in Midwood — No Fee"
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
                rows={5}
                placeholder="Describe the apartment — layout, finishes, light, amenities, building perks…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 resize-y"
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={uploadingMedia}
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingMedia ? 'Uploading…' : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <StepTips {...TIPS} />
    </div>
  );
}
