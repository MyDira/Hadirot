import React from 'react';
import { ArrowLeft, ArrowRight, Home } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Property & Layout',
  bullets: [
    'Be honest about property type — buyers filter by it; mislabeled listings hide from the buyers who actually want you.',
    'Building type affects price expectations significantly for sales — pick carefully.',
    'Year built can be approximate. Year renovated only counts if it was a real renovation, not paint.',
  ],
};

// ── Custom property-type icons ────────────────────────────────────────────────
// All share the same 24×24 viewBox and stroke style so they feel like a family.

/** 1-story house — same roof angle as the 2 & 3 family, single floor */
const SingleFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5L12 4l9 7.5" />
    <rect x="3" y="11.5" width="18" height="10.5" rx="0.5" />
    <rect x="6" y="13.5" width="4" height="3.5" rx="0.5" />
    <rect x="14" y="13.5" width="4" height="3.5" rx="0.5" />
    <rect x="10" y="16.5" width="4" height="5.5" rx="0.5" />
  </svg>
);

/** 2-story house — same roofline, body split into 2 floors */
const TwoFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5L12 4l9 7.5" />
    <rect x="3" y="11.5" width="18" height="10.5" rx="0.5" />
    <line x1="3" y1="16.5" x2="21" y2="16.5" />
    {/* upper floor windows */}
    <rect x="5.5" y="12.5" width="4" height="3" rx="0.5" />
    <rect x="14.5" y="12.5" width="4" height="3" rx="0.5" />
    {/* door on lower floor */}
    <rect x="10" y="17.5" width="4" height="4.5" rx="0.5" />
  </svg>
);

/** 3-story house — roof raised to accommodate the extra floor, 2 floor dividers */
const ThreeFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 2l9 7.5" />
    <rect x="3" y="9.5" width="18" height="12.5" rx="0.5" />
    <line x1="3" y1="13.7" x2="21" y2="13.7" />
    <line x1="3" y1="17.9" x2="21" y2="17.9" />
    {/* top floor */}
    <rect x="6" y="10.5" width="3.5" height="2.5" rx="0.5" />
    <rect x="14.5" y="10.5" width="3.5" height="2.5" rx="0.5" />
    {/* middle floor */}
    <rect x="6" y="14.7" width="3.5" height="2.5" rx="0.5" />
    <rect x="14.5" y="14.7" width="3.5" height="2.5" rx="0.5" />
    {/* door on ground floor */}
    <rect x="10" y="18.8" width="4" height="3.2" rx="0.5" />
  </svg>
);

/** 4+ unit apartment building — flat-roofed, wider, 3 window columns × 3 rows */
const MultiFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="18" rx="1" />
    <line x1="2" y1="9.3"  x2="22" y2="9.3" />
    <line x1="2" y1="14.6" x2="22" y2="14.6" />
    {/* row 1 */}
    <rect x="4.5" y="5.5" width="4" height="3" rx="0.5" />
    <rect x="10"  y="5.5" width="4" height="3" rx="0.5" />
    <rect x="15.5" y="5.5" width="4" height="3" rx="0.5" />
    {/* row 2 */}
    <rect x="4.5" y="10.8" width="4" height="3" rx="0.5" />
    <rect x="10"  y="10.8" width="4" height="3" rx="0.5" />
    <rect x="15.5" y="10.8" width="4" height="3" rx="0.5" />
    {/* ground floor: door + side windows */}
    <rect x="4.5" y="16" width="4" height="6" rx="0.5" />
    <rect x="10"  y="16.5" width="4" height="5.5" rx="0.5" />
    <rect x="15.5" y="16" width="4" height="6" rx="0.5" />
  </svg>
);

/** Condo — slim modern tower, tall and narrow, 4 window rows */
const CondoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="1" width="14" height="21" rx="1" />
    <line x1="5" y1="6.5"  x2="19" y2="6.5" />
    <line x1="5" y1="11.5" x2="19" y2="11.5" />
    <line x1="5" y1="16.5" x2="19" y2="16.5" />
    {/* row 1 */}
    <rect x="7" y="2.5" width="4" height="3" rx="0.5" />
    <rect x="13" y="2.5" width="4" height="3" rx="0.5" />
    {/* row 2 */}
    <rect x="7" y="8" width="4" height="3" rx="0.5" />
    <rect x="13" y="8" width="4" height="3" rx="0.5" />
    {/* row 3 */}
    <rect x="7" y="13" width="4" height="3" rx="0.5" />
    <rect x="13" y="13" width="4" height="3" rx="0.5" />
    {/* lobby / entry */}
    <rect x="10" y="18" width="4" height="4" rx="0.5" />
  </svg>
);

/** Co-op — wider classic pre-war building, 3-column façade, cornice line */
const CoopIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    {/* cornice / parapet */}
    <rect x="1" y="3" width="22" height="2" rx="0.5" />
    {/* main body */}
    <rect x="1" y="5" width="22" height="17" rx="0.5" />
    <line x1="1" y1="10.5" x2="23" y2="10.5" />
    <line x1="1" y1="16"   x2="23" y2="16" />
    {/* row 1 — 3 windows */}
    <rect x="3"  y="6.5" width="4" height="3" rx="0.5" />
    <rect x="10" y="6.5" width="4" height="3" rx="0.5" />
    <rect x="17" y="6.5" width="4" height="3" rx="0.5" />
    {/* row 2 — 3 windows */}
    <rect x="3"  y="12" width="4" height="3" rx="0.5" />
    <rect x="10" y="12" width="4" height="3" rx="0.5" />
    <rect x="17" y="12" width="4" height="3" rx="0.5" />
    {/* ground: door + flanking windows */}
    <rect x="3"  y="17.5" width="4" height="4.5" rx="0.5" />
    <rect x="10" y="17"   width="4" height="5"   rx="0.5" />
    <rect x="17" y="17.5" width="4" height="4.5" rx="0.5" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single-Family', icon: <SingleFamilyIcon /> },
  { value: 'two_family',    label: 'Two-Family',    icon: <TwoFamilyIcon /> },
  { value: 'three_family',  label: 'Three-Family',  icon: <ThreeFamilyIcon /> },
  { value: 'four_family',   label: 'Multi-Family',  icon: <MultiFamilyIcon /> },
  { value: 'condo',         label: 'Condo',         icon: <CondoIcon /> },
  { value: 'co_op',         label: 'Co-op',         icon: <CoopIcon /> },
] as const;

const BUILDING_TYPES = [
  { value: 'detached',       label: 'Detached' },
  { value: 'semi_attached',  label: 'Semi-Attached' },
  { value: 'fully_attached', label: 'Fully Attached' },
  { value: 'apartment',      label: 'Apartment' },
] as const;

const BEDROOM_OPTIONS = [
  { value: 0, label: 'Studio' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8+' },
];

const BATHROOM_OPTIONS = [
  { value: 1,   label: '1' },
  { value: 1.5, label: '1.5' },
  { value: 2,   label: '2' },
  { value: 2.5, label: '2.5' },
  { value: 3,   label: '3' },
  { value: 3.5, label: '3.5' },
  { value: 4,   label: '4+' },
];

interface Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1SalePropertyAndLayout({ formData, updateFormData, onNext, onBack }: Props) {
  // Only true multi-family (4+) has a variable unit count worth specifying
  const showUnitCount = formData.property_type === 'four_family';

  const canContinue =
    !!formData.property_type &&
    !!formData.building_type &&
    formData.bedrooms !== undefined &&
    !!formData.bathrooms;

  const handlePropertyTypeSelect = (value: string) => {
    const updates: Partial<ListingFormData> = { property_type: value as ListingFormData['property_type'] };
    // Condo and Co-op are always apartments — auto-select but let user override
    if (value === 'condo' || value === 'co_op') {
      updates.building_type = 'apartment';
    }
    updateFormData(updates);
  };

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Property & Layout</h2>

          {/* Property Type */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Property Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PROPERTY_TYPES.map(pt => {
                const selected = formData.property_type === pt.value;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => handlePropertyTypeSelect(pt.value)}
                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 text-center transition-all aspect-square ${
                      selected
                        ? 'border-brand-700 bg-brand-50 text-brand-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span className={selected ? 'text-brand-700' : 'text-gray-400'}>{pt.icon}</span>
                    <span className="text-[10px] font-medium leading-tight">{pt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Building Type */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Building Type <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BUILDING_TYPES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateFormData({ building_type: opt.value })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    formData.building_type === opt.value
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bedrooms */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bedrooms <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BEDROOM_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateFormData({ bedrooms: opt.value })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    formData.bedrooms === opt.value
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bathrooms */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bathrooms <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BATHROOM_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateFormData({ bathrooms: opt.value })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    formData.bathrooms === opt.value
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Floors / Year Built / Year Renovated */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Floors
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.number_of_floors ?? ''}
                onChange={e => updateFormData({ number_of_floors: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year Built
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear() + 5}
                value={formData.year_built ?? ''}
                onChange={e => updateFormData({ year_built: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 1950"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year Renovated
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear() + 5}
                value={formData.year_renovated ?? ''}
                onChange={e => updateFormData({ year_renovated: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 2020"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
          </div>

          {/* Number of Units — bottom row, only for true multi-family (4+) */}
          {showUnitCount && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Units
                  <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="number"
                  min={2}
                  value={formData.unit_count ?? ''}
                  onChange={e => updateFormData({ unit_count: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 6"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <StepTips {...TIPS} />
    </div>
  );
}
