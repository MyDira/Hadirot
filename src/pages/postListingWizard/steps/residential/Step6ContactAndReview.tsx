import React, { useEffect } from 'react';
import { ArrowLeft, Send, CheckCircle, Image, AlertCircle } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import type { Profile } from '../../../../config/supabase';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Contact & Review',
  bullets: [
    'Double-check your phone number — that\'s how renters reach you.',
    'We\'ll send you SMS updates on your listing status — standard rates apply.',
    'Your listing will be reviewed before going live.',
  ],
};

const LEASE_LABELS: Record<string, string> = {
  short_term: 'Short Term',
  long_term_annual: 'Long Term / Annual',
  summer_rental: 'Summer Rental',
  winter_rental: 'Winter Rental',
};

const PARKING_LABELS: Record<string, string> = {
  no: 'No Parking',
  yes: 'Paid',
  included: 'Included',
  optional: 'Optional',
};

interface ReviewRow {
  label: string;
  value: string;
}

interface Step6Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  mediaFiles: MediaFile[];
  resolvedNeighborhood: string;
  loading: boolean;
  uploadingMedia: boolean;
  submitError: string | null;
  onSubmit: () => void;
  profile: Profile | null;
}

export function Step6ContactAndReview({
  formData,
  updateFormData,
  onBack,
  mediaFiles,
  resolvedNeighborhood,
  loading,
  uploadingMedia,
  submitError,
  onSubmit,
  profile,
}: Step6Props) {
  // Pre-fill contact info from profile on first load
  useEffect(() => {
    if (profile?.full_name && !formData.contact_name) {
      updateFormData({ contact_name: profile.full_name });
    }
    if (profile?.phone && !formData.contact_phone) {
      updateFormData({ contact_phone: profile.phone });
    }
  }, [profile]);

  const canSubmit = !!formData.contact_name.trim() && !!formData.contact_phone.trim() && formData.terms_agreed;

  const bedroomLabel =
    formData.bedrooms === 0
      ? 'Studio'
      : formData.additional_rooms > 0
      ? `${formData.bedrooms}+${formData.additional_rooms} BR`
      : `${formData.bedrooms} BR`;

  const reviewSections: { title: string; rows: ReviewRow[] }[] = [
    {
      title: 'Property',
      rows: [
        {
          label: 'Type',
          value: (formData.property_type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        },
        { label: 'Bedrooms', value: bedroomLabel },
        { label: 'Bathrooms', value: String(formData.bathrooms) },
        ...(formData.floor != null ? [{ label: 'Floor', value: String(formData.floor) }] : []),
      ].filter(r => r.value),
    },
    {
      title: 'Price & Terms',
      rows: [
        {
          label: 'Rent',
          value: formData.call_for_price
            ? 'Call for Price'
            : formData.price
            ? `$${formData.price.toLocaleString()}/mo`
            : '',
        },
        {
          label: 'Lease',
          value: formData.lease_length ? LEASE_LABELS[formData.lease_length] || formData.lease_length : '',
        },
        { label: 'Broker Fee', value: formData.broker_fee ? 'Yes (disclosed)' : 'No Fee' },
      ].filter(r => r.value),
    },
    {
      title: 'Location',
      rows: [
        { label: 'Cross Streets', value: formData.location },
        { label: 'Neighborhood', value: resolvedNeighborhood },
      ].filter(r => r.value),
    },
    {
      title: 'Features',
      rows: [
        {
          label: 'Utilities',
          value: (formData.utilities_included ?? []).join(', ') || '',
        },
        { label: 'Parking', value: PARKING_LABELS[formData.parking] || '' },
        ...(formData.ac_type ? [{ label: 'AC', value: formData.ac_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.washer_dryer_hookup ? [{ label: 'Washer/Dryer', value: 'Yes' }] : []),
        ...(formData.dishwasher ? [{ label: 'Dishwasher', value: 'Yes' }] : []),
        ...(formData.square_footage ? [{ label: 'Square Footage', value: `${formData.square_footage} sq ft` }] : []),
      ].filter(r => r.value),
    },
  ];

  const photoCount = mediaFiles.filter(m => m.type === 'image').length;

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        {/* Contact Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Contact Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contact_name}
                onChange={e => updateFormData({ contact_name: e.target.value })}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={e => updateFormData({ contact_phone: e.target.value })}
                placeholder="e.g. 718-555-1234"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
          </div>
        </div>

        {/* Review Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Review Your Listing</h2>
          <p className="text-sm text-gray-500 mb-5">Double-check your details before submitting</p>

          <div className="space-y-5">
            {reviewSections.map(section =>
              section.rows.length > 0 ? (
                <div key={section.title}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {section.title}
                  </h3>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                    {section.rows.map(row => (
                      <div key={row.label} className="flex justify-between items-baseline px-4 py-2.5">
                        <span className="text-sm text-gray-600">{row.label}</span>
                        <span className="text-sm font-medium text-gray-900 text-right ml-4 max-w-[60%] truncate">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}

            {/* Photos */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</h3>
              <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-2">
                <Image className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {photoCount > 0
                    ? `${photoCount} photo${photoCount !== 1 ? 's' : ''} uploaded`
                    : 'No photos uploaded'}
                </span>
                {photoCount > 0 && <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />}
              </div>
            </div>
          </div>
        </div>

        {/* SMS Consent + Submit */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.terms_agreed}
              onChange={e => updateFormData({ terms_agreed: e.target.checked })}
              className="mt-1 h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">
              I agree to receive SMS messages about my listing and inquiries. Message and data rates may apply. See{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent-600 font-semibold hover:underline">
                Privacy Policy
              </a>{' '}
              and{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent-600 font-semibold hover:underline">
                Terms of Use
              </a>{' '}
              for more information.
            </span>
          </label>

          {submitError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
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
              onClick={onSubmit}
              disabled={!canSubmit || loading || uploadingMedia}
              className="flex items-center gap-2 bg-accent-500 text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : uploadingMedia ? (
                'Uploading…'
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Post Listing
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <StepTips {...TIPS} />
    </div>
  );
}
