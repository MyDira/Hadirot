import React, { useEffect } from 'react';
import { ArrowLeft, Send, CheckCircle, Image, AlertCircle } from 'lucide-react';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Review & Submit',
  bullets: [
    'Tips will appear here.',
  ],
};
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import type { Profile } from '../../../../config/supabase';
import type { CommercialStepProps } from './_StepShell';

interface Props extends CommercialStepProps {
  mediaFiles: MediaFile[];
  resolvedNeighborhood: string;
  loading: boolean;
  uploadingMedia: boolean;
  submitError: string | null;
  onSubmit: () => void;
  profile: Profile | null;
}

interface ReviewRow {
  label: string;
  value: string;
}

const titleize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

export function Step6CommercialContactAndReview({
  formData,
  updateFormData,
  isSale,
  onBack,
  mediaFiles,
  resolvedNeighborhood,
  loading,
  uploadingMedia,
  submitError,
  onSubmit,
  profile,
}: Props) {
  // Prefill contact info from profile on first load
  useEffect(() => {
    if (profile?.full_name && !formData.contact_name) {
      updateFormData({ contact_name: profile.full_name });
    }
    if (profile?.phone && !formData.contact_phone) {
      updateFormData({ contact_phone: profile.phone });
    }
  }, [profile]);

  const canSubmit =
    !!formData.contact_name.trim() &&
    !!formData.contact_phone.trim() &&
    formData.terms_agreed &&
    !loading &&
    !uploadingMedia;

  const spaceLabel = formData.commercial_space_type ? titleize(formData.commercial_space_type) : '';
  const subtypeLabel = formData.commercial_subtype ? titleize(formData.commercial_subtype) : '';

  const reviewSections: { title: string; rows: ReviewRow[]; longValue?: boolean }[] = [
    {
      title: 'Listing',
      rows: [
        { label: 'Title', value: formData.title?.trim() || '(auto-generated on submit)' },
        { label: 'Description', value: formData.description?.trim() || '' },
        ...(formData.video_url ? [{ label: 'Video', value: formData.video_url }] : []),
      ].filter(r => r.value),
      longValue: true,
    },
    {
      title: 'Space',
      rows: [
        { label: 'Type', value: spaceLabel },
        ...(subtypeLabel ? [{ label: 'Subtype', value: subtypeLabel }] : []),
        ...(formData.available_sf ? [{ label: 'Available SF', value: `${formData.available_sf.toLocaleString()} SF` }] : []),
        ...(formData.ceiling_height_ft ? [{ label: 'Ceiling Height', value: `${formData.ceiling_height_ft} ft` }] : []),
        ...(formData.floor_level ? [{ label: 'Floor Level', value: titleize(formData.floor_level) }] : []),
        ...(formData.build_out_condition ? [{ label: 'Build-Out', value: titleize(formData.build_out_condition) }] : []),
        ...(!isSale && formData.lease_type ? [{ label: 'Lease Type', value: titleize(formData.lease_type) }] : []),
      ].filter(r => r.value),
    },
    {
      title: 'Pricing',
      rows: isSale
        ? [
            {
              label: 'Asking Price',
              value: formData.call_for_price
                ? 'Contact for pricing'
                : formData.asking_price
                ? `$${formData.asking_price.toLocaleString()}`
                : '',
            },
          ].filter(r => r.value)
        : [
            {
              label: 'Monthly Rent',
              value: formData.call_for_price
                ? 'Contact for pricing'
                : formData.price
                ? `$${formData.price.toLocaleString()}/mo`
                : '',
            },
            ...(!formData.call_for_price && formData.price_per_sf_year
              ? [{ label: '$ / SF / year', value: `$${formData.price_per_sf_year}` }]
              : []),
          ].filter(r => r.value),
    },
    {
      title: 'Location',
      rows: [
        formData.full_address
          ? { label: 'Address', value: formData.full_address }
          : {
              label: 'Cross Streets',
              value:
                formData.cross_street_a && formData.cross_street_b
                  ? `${formData.cross_street_a} & ${formData.cross_street_b}`
                  : '',
            },
        { label: 'Neighborhood', value: resolvedNeighborhood || formData.neighborhood || '' },
      ].filter(r => r.value),
    },
    ...(isSale
      ? [
          {
            title: 'Sale Financials',
            rows: [
              ...(formData.cap_rate ? [{ label: 'Cap Rate', value: `${formData.cap_rate}%` }] : []),
              ...(formData.noi ? [{ label: 'NOI', value: `$${formData.noi.toLocaleString()}/yr` }] : []),
              ...(formData.property_taxes_annual
                ? [{ label: 'Property Taxes', value: `$${formData.property_taxes_annual.toLocaleString()}/yr` }]
                : []),
              ...(formData.tenancy_type ? [{ label: 'Tenancy', value: titleize(formData.tenancy_type) }] : []),
            ].filter(r => r.value),
          },
        ]
      : [
          {
            title: 'Lease Terms',
            rows: [
              ...(formData.lease_term_text ? [{ label: 'Term', value: formData.lease_term_text }] : []),
              ...(formData.ti_allowance_per_sf
                ? [{ label: 'TI Allowance', value: `$${formData.ti_allowance_per_sf}/SF` }]
                : []),
              ...(formData.escalation ? [{ label: 'Escalation', value: formData.escalation }] : []),
              ...(formData.security_deposit ? [{ label: 'Security Deposit', value: formData.security_deposit }] : []),
            ].filter(r => r.value),
          },
        ]),
    {
      title: 'Building',
      rows: [
        ...(formData.total_building_sf
          ? [{ label: 'Total Building SF', value: `${formData.total_building_sf.toLocaleString()} SF` }]
          : []),
        ...(formData.year_built ? [{ label: 'Year Built', value: String(formData.year_built) }] : []),
        ...(formData.year_renovated ? [{ label: 'Renovated', value: String(formData.year_renovated) }] : []),
        ...(formData.number_of_floors ? [{ label: 'Floors', value: String(formData.number_of_floors) }] : []),
        ...(formData.parking_spaces ? [{ label: 'Parking Spaces', value: String(formData.parking_spaces) }] : []),
        ...(formData.zoning_code ? [{ label: 'Zoning', value: formData.zoning_code }] : []),
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
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Posting As</label>
            <select
              value={formData.admin_listing_type_display || 'agent'}
              onChange={e => updateFormData({ admin_listing_type_display: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 bg-white"
            >
              <option value="agent">Agent / Broker</option>
              <option value="owner">Owner</option>
              <option value="management">Management</option>
            </select>
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
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{section.title}</h3>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                  {section.rows.map(row => (
                    <div
                      key={row.label}
                      className={`px-4 py-2.5 ${section.longValue ? 'flex flex-col gap-0.5' : 'flex justify-between items-baseline'}`}
                    >
                      <span className="text-sm text-gray-500">{row.label}</span>
                      <span
                        className={`text-sm font-medium text-gray-900 ${
                          section.longValue ? '' : 'text-right ml-4 max-w-[60%] truncate'
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
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
            {photoCount > 0 ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {[...mediaFiles.filter(m => m.type === 'image' && m.is_featured),
                  ...mediaFiles.filter(m => m.type === 'image' && !m.is_featured)]
                  .slice(0, 8)
                  .map(m => (
                    <div key={m.id} className="relative aspect-square rounded-md overflow-hidden border border-gray-200">
                      <img src={m.url} alt="Listing photo" className="w-full h-full object-cover" />
                      {m.is_featured && (
                        <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-500 text-white">
                          Cover
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-start gap-2">
                <Image className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>No photos uploaded — listings without photos get far fewer views.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terms + Submit */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.terms_agreed}
            onChange={e => updateFormData({ terms_agreed: e.target.checked })}
            className="mt-1 h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700">
            I confirm that all information provided is accurate and I have the authority to list this property.
            I agree to HaDirot's terms of service.
          </span>
        </label>

        {submitError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}
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
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting…' : (<>Post Listing <Send className="w-4 h-4" /></>)}
        </button>
      </div>
    </div>
    <StepTips {...TIPS} />
    </div>
  );
}
