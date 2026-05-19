import React, { useEffect } from 'react';
import { ArrowLeft, Send, CheckCircle, Image, AlertCircle } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import type { Profile } from '../../../../config/supabase';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Contact & Review',
  bullets: [
    'Read through the full summary carefully before submitting.',
    'Once live, buyers are already forming an impression — errors or missing info can cost you inquiries.',
  ],
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: 'Single-Family',
  two_family: 'Two-Family',
  three_family: 'Three-Family',
  four_family: 'Multi-Family',
  condo: 'Condo',
  co_op: 'Co-op',
};

const BUILDING_TYPE_LABELS: Record<string, string> = {
  detached: 'Detached',
  semi_attached: 'Semi-Attached',
  fully_attached: 'Fully Attached',
  apartment: 'Apartment',
};

const PARKING_LABELS: Record<string, string> = {
  no: 'No Parking',
  yes: 'Private Driveway',
  included: 'Shared Driveway',
  carport: 'Carport',
  optional: 'Easement',
};

interface ReviewRow {
  label: string;
  value: string;
}

interface Step7Props {
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

export function Step7SaleContactAndReview({
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
}: Step7Props) {
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

  const bedroomLabel = formData.bedrooms === 0 ? 'Studio' : `${formData.bedrooms} BR`;
  const isCoOp = formData.property_type === 'co_op';

  const buildingSize =
    formData.building_size_input_mode === 'dimensions' && formData.building_length_ft && formData.building_width_ft
      ? Math.round(formData.building_length_ft * formData.building_width_ft)
      : formData.building_size_sqft;
  const lotSize =
    formData.lot_size_input_mode === 'dimensions' && formData.property_length_ft && formData.property_width_ft
      ? Math.round(formData.property_length_ft * formData.property_width_ft)
      : formData.lot_size_sqft;

  const reviewSections: { title: string; rows: ReviewRow[]; longValue?: boolean }[] = [
    {
      title: 'Listing Details',
      rows: [
        { label: 'Title', value: formData.title?.trim() || '(auto-generated on submit)' },
        { label: 'Description', value: formData.description?.trim() || '' },
      ].filter(r => r.value),
      longValue: true,
    },
    {
      title: 'Property',
      rows: [
        { label: 'Type', value: PROPERTY_TYPE_LABELS[formData.property_type] || '' },
        { label: 'Building Type', value: formData.building_type ? (BUILDING_TYPE_LABELS[formData.building_type] || formData.building_type) : '' },
        { label: 'Bedrooms', value: bedroomLabel },
        { label: 'Bathrooms', value: String(formData.bathrooms) },
        ...(formData.number_of_floors ? [{ label: 'Floors', value: String(formData.number_of_floors) }] : []),
        ...(formData.unit_count ? [{ label: 'Units', value: String(formData.unit_count) }] : []),
        ...(formData.year_built ? [{ label: 'Year Built', value: String(formData.year_built) }] : []),
        ...(formData.year_renovated ? [{ label: 'Year Renovated', value: String(formData.year_renovated) }] : []),
      ].filter(r => r.value),
    },
    {
      title: 'Size & Price',
      rows: [
        {
          label: 'Asking Price',
          value: formData.call_for_price
            ? 'Call for Price'
            : formData.asking_price
            ? `$${formData.asking_price.toLocaleString()}`
            : '',
        },
        ...(buildingSize ? [{ label: 'Building Size', value: `${buildingSize.toLocaleString()} sq ft` }] : []),
        ...(lotSize ? [{ label: 'Lot Size', value: `${lotSize.toLocaleString()} sq ft` }] : []),
        ...(formData.property_taxes ? [{ label: 'Annual Taxes', value: `$${formData.property_taxes.toLocaleString()}` }] : []),
        ...(formData.hoa_fees ? [{ label: isCoOp ? 'Maintenance' : 'HOA', value: `$${formData.hoa_fees.toLocaleString()}/mo` }] : []),
      ].filter(r => r.value),
    },
    {
      title: 'Location',
      rows: [
        { label: formData.street_address ? 'Address' : 'Cross Streets', value: formData.street_address || formData.location },
        { label: 'Neighborhood', value: resolvedNeighborhood },
      ].filter(r => r.value),
    },
    {
      title: 'Condition & Status',
      rows: [
        ...(formData.property_condition ? [{ label: 'Condition', value: String(formData.property_condition).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.occupancy_status ? [{ label: 'Occupancy', value: String(formData.occupancy_status).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.delivery_condition ? [{ label: 'Delivery', value: String(formData.delivery_condition).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        { label: 'Parking', value: PARKING_LABELS[formData.parking] || '' },
      ].filter(r => r.value),
    },
    {
      title: 'Features',
      rows: [
        ...(formData.heating_type ? [{ label: 'Heating', value: String(formData.heating_type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.ac_type ? [{ label: 'AC', value: String(formData.ac_type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.laundry_type ? [{ label: 'Laundry', value: String(formData.laundry_type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.basement_type ? [{ label: 'Basement', value: String(formData.basement_type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.outdoor_space?.length ? [{ label: 'Outdoor', value: formData.outdoor_space.join(', ').replace(/_/g, ' ') }] : []),
        ...(formData.interior_features?.length ? [{ label: 'Interior', value: formData.interior_features.join(', ').replace(/_/g, ' ') }] : []),
        ...(formData.apartment_conditions?.length ? [{ label: 'Appliances', value: formData.apartment_conditions.join(', ').replace(/_/g, ' ') }] : []),
      ].filter(r => r.value),
    },
    ...(['two_family', 'three_family', 'four_family'].includes(formData.property_type)
      ? [{
          title: 'Multi-Family',
          rows: [
            ...(formData.rent_roll_total ? [{ label: 'Total Rent Roll', value: `$${formData.rent_roll_total.toLocaleString()}/mo` }] : []),
            ...(formData.rent_roll_data?.length ? [{ label: 'Units', value: `${formData.rent_roll_data.length} entered` }] : []),
            ...(formData.utilities_included?.length ? [{ label: 'Utilities Included', value: formData.utilities_included.join(', ') }] : []),
          ].filter(r => r.value),
        }]
      : []),
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
                      <div
                        key={row.label}
                        className={`px-4 py-2.5 ${section.longValue ? 'flex flex-col gap-0.5' : 'flex justify-between items-baseline'}`}
                      >
                        <span className="text-sm text-gray-500">{row.label}</span>
                        <span className={`text-sm font-medium text-gray-900 ${section.longValue ? '' : 'text-right ml-4 max-w-[60%] truncate'}`}>
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
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Photos
                {photoCount > 0 && (
                  <span className="ml-2 text-green-600 normal-case font-normal">
                    {photoCount} uploaded <CheckCircle className="inline w-3 h-3 mb-0.5" />
                  </span>
                )}
              </h3>
              {photoCount > 0 ? (() => {
                const photos = mediaFiles.filter(m => m.type === 'image');
                // Featured first, then the rest in order
                const sorted = [
                  ...photos.filter(p => p.is_featured),
                  ...photos.filter(p => !p.is_featured),
                ];
                const MAX_SHOWN = 8;
                const shown = sorted.slice(0, MAX_SHOWN);
                const overflow = sorted.length - shown.length;
                return (
                  <div className="flex flex-wrap gap-2">
                    {shown.map((photo, i) => (
                      <div key={photo.id} className="relative flex-shrink-0">
                        <img
                          src={photo.url}
                          alt={photo.originalName ?? `Photo ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-md border border-gray-200"
                        />
                        {photo.is_featured && (
                          <span className="absolute bottom-0.5 left-0.5 bg-accent-500 text-white text-[9px] font-semibold px-1 rounded leading-tight">
                            Main
                          </span>
                        )}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="w-16 h-16 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                        +{overflow}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-2 text-sm text-gray-400">
                  <Image className="w-4 h-4" />
                  No photos uploaded
                </div>
              )}
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
