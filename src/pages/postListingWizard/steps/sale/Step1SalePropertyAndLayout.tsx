import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
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

// ── Icons ─────────────────────────────────────────────────────────────────────
// All share the same 24×24 viewBox, strokeWidth 1.5, round caps/joins.
// The single/two/three family series uses an identical silhouette that grows
// taller with each floor added — one horizontal line per extra floor.

/** 1-story house: peaked roof + single floor body + door */
const SingleFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L12 3l9 8" />
    <path d="M4 11v11h16V11" />
    <path d="M10 22v-5h4v5" />
  </svg>
);

/** 2-story house: same silhouette + 1 floor divider */
const TwoFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L12 3l9 8" />
    <path d="M4 11v11h16V11" />
    <line x1="4" y1="16.5" x2="20" y2="16.5" />
    <path d="M10 22v-4h4v4" />
  </svg>
);

/** 3-story house: roof raised one step + 2 floor dividers */
const ThreeFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 2l9 7.5" />
    <path d="M4 9.5v12.5h16V9.5" />
    <line x1="4" y1="13.8" x2="20" y2="13.8" />
    <line x1="4" y1="18.1" x2="20" y2="18.1" />
    <path d="M10 22v-3.5h4V22" />
  </svg>
);

/** Multi-family: flat-top apartment block, 3 equal floors, wider proportions */
const MultiFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="18" rx="1" />
    <line x1="2" y1="10" x2="22" y2="10" />
    <line x1="2" y1="16" x2="22" y2="16" />
    <path d="M10 22v-5h4v5" />
  </svg>
);

/** Condo: slim modern tower — tall & narrow, 4 floor bands */
const CondoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="1" width="12" height="21" rx="1" />
    <line x1="6" y1="6.5"  x2="18" y2="6.5" />
    <line x1="6" y1="12"   x2="18" y2="12" />
    <line x1="6" y1="17"   x2="18" y2="17" />
    <path d="M10 22v-4.5h4V22" />
  </svg>
);

/** Co-op: wide pre-war building — low & wide, classical arched entry */
const CoopIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="18" rx="1" />
    <line x1="1" y1="10" x2="23" y2="10" />
    <line x1="1" y1="16" x2="23" y2="16" />
    {/* Arched door — the semicircular arch is the visual cue for pre-war/classical */}
    <path d="M9 22v-2a3 3 0 0 1 6 0v2" />
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
  const showUnitCount = formData.property_type === 'four_family';

  const canContinue =
    !!formData.property_type &&
    !!formData.building_type &&
    formData.bedrooms !== undefined &&
    !!formData.bathrooms;

  const handlePropertyTypeSelect = (value: string) => {
    const updates: Partial<ListingFormData> = { property_type: value as ListingFormData['property_type'] };
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
