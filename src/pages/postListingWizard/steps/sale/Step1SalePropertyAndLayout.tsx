import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Basic Info',
  bullets: [
    'Double-check your bed/bath count — buyers filter by this first.',
    'If you\'re unsure of the building type, "Fully Attached" means shared walls on both sides (like a rowhouse).',
  ],
};

// ── Icons ─────────────────────────────────────────────────────────────────────
// House series (1–3 family): same peaked silhouette, grows taller with each
// unit. Two-family shows two entry doors (duplex). Three-family is a taller
// urban rowhouse with two floor bands.
// Building series (multi / condo / co-op): flat-roof shapes, clearly distinct
// proportions and details so each is immediately recognisable.

/** Single-family: classic peaked house, one door, two windows */
const SingleFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Roof */}
    <path d="M3 11L12 3l9 8" />
    {/* Walls */}
    <path d="M4 11v11h16V11" />
    {/* Left window */}
    <rect x="5.5" y="13" width="3.5" height="3" rx="0.5" />
    {/* Right window */}
    <rect x="15" y="13" width="3.5" height="3" rx="0.5" />
    {/* Central door */}
    <path d="M10 22v-5h4v5" />
  </svg>
);

/**
 * Two-family: two-storey house with a floor-divider line and two entry
 * doors side by side — the visual cue for a duplex.
 */
const TwoFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Roof (higher peak = taller building) */}
    <path d="M3 10L12 2l9 8" />
    {/* Walls */}
    <path d="M4 10v12h16V10" />
    {/* Floor divider */}
    <line x1="4" y1="16" x2="20" y2="16" />
    {/* 2nd-floor windows */}
    <rect x="5.5" y="11" width="3" height="2.5" rx="0.5" />
    <rect x="15.5" y="11" width="3" height="2.5" rx="0.5" />
    {/* 1st-floor: two doors (left unit + right unit) */}
    <rect x="5.5" y="17.5" width="3" height="4.5" rx="0.5" />
    <rect x="15.5" y="17.5" width="3" height="4.5" rx="0.5" />
  </svg>
);

/**
 * Three-family: tall urban rowhouse / brownstone with two floor bands,
 * a stoop step, and one window per floor.
 */
const ThreeFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Roof */}
    <path d="M3 9.5L12 2l9 7.5" />
    {/* Walls */}
    <path d="M4 9.5v12.5h16V9.5" />
    {/* Floor dividers */}
    <line x1="4" y1="13.8" x2="20" y2="13.8" />
    <line x1="4" y1="18"   x2="20" y2="18" />
    {/* Windows — one centred per floor */}
    <rect x="9" y="10.3" width="6" height="2.5" rx="0.5" />
    <rect x="9" y="14.8" width="6" height="2.5" rx="0.5" />
    {/* Stoop step + door */}
    <line x1="8" y1="22" x2="16" y2="22" />
    <path d="M10 22v-3.5h4V22" />
  </svg>
);

/**
 * Multi-family (4+): wide, squat apartment building — flat roof with a
 * parapet coping, three floors, 2 × 2 window grid, central entry.
 */
const MultiFamilyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Parapet / roofline coping */}
    <rect x="1" y="3" width="22" height="2.5" rx="0.5" />
    {/* Main body */}
    <rect x="1" y="5.5" width="22" height="16.5" rx="0" />
    {/* Floor dividers */}
    <line x1="1" y1="11" x2="23" y2="11" />
    <line x1="1" y1="16.5" x2="23" y2="16.5" />
    {/* Windows 2 × 2 (top two floors) */}
    <rect x="3.5" y="6.5"  width="3.5" height="3" rx="0.5" />
    <rect x="17"  y="6.5"  width="3.5" height="3" rx="0.5" />
    <rect x="3.5" y="12"   width="3.5" height="3" rx="0.5" />
    <rect x="17"  y="12"   width="3.5" height="3" rx="0.5" />
    {/* Central door */}
    <path d="M10 22v-5h4v5" />
  </svg>
);

/**
 * Condo: slim modern tower — tall & narrow with 4 floor bands and a
 * 2 × 4 window grid, clearly taller-to-wider ratio than multi-family.
 */
const CondoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Tower body */}
    <rect x="5" y="1" width="14" height="21" rx="1" />
    {/* Floor dividers */}
    <line x1="5" y1="6.5"  x2="19" y2="6.5" />
    <line x1="5" y1="11.5" x2="19" y2="11.5" />
    <line x1="5" y1="16.5" x2="19" y2="16.5" />
    {/* Windows 2 × 3 */}
    <rect x="6.5" y="2.5"  width="3" height="3" rx="0.5" />
    <rect x="14.5" y="2.5" width="3" height="3" rx="0.5" />
    <rect x="6.5" y="7.5"  width="3" height="3" rx="0.5" />
    <rect x="14.5" y="7.5" width="3" height="3" rx="0.5" />
    <rect x="6.5" y="12.5" width="3" height="3" rx="0.5" />
    <rect x="14.5" y="12.5" width="3" height="3" rx="0.5" />
    {/* Door */}
    <path d="M10 22v-5h4v5" />
  </svg>
);

/**
 * Co-op: wide pre-war / classical building — low & wide, decorative
 * cornice band at top, 3 × 2 window grid, arched central entry.
 */
const CoopIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Decorative cornice band */}
    <rect x="1" y="3" width="22" height="3" rx="0.5" />
    {/* Building body */}
    <path d="M1 6h22v16H1z" />
    {/* Floor divider */}
    <line x1="1" y1="13" x2="23" y2="13" />
    {/* Windows 3 × 2 */}
    <rect x="2.5" y="7.5"  width="3.5" height="3.5" rx="0.5" />
    <rect x="10.25" y="7.5" width="3.5" height="3.5" rx="0.5" />
    <rect x="18"  y="7.5"  width="3.5" height="3.5" rx="0.5" />
    <rect x="2.5" y="14"   width="3.5" height="3.5" rx="0.5" />
    <rect x="18"  y="14"   width="3.5" height="3.5" rx="0.5" />
    {/* Arched entry — pre-war / classical identifier */}
    <path d="M9.5 22v-3.5a2.5 2.5 0 015 0V22" />
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
  const canContinue =
    !!formData.property_type &&
    !!formData.building_type &&
    formData.bedrooms !== undefined &&
    !!formData.bathrooms &&
    (formData.call_for_price || (!!formData.asking_price && formData.asking_price > 0));

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
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Basic Info</h2>

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

          {/* Asking Price */}
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Asking Price <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-4">
              <div className="relative w-56">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={1}
                  step={1000}
                  value={formData.asking_price ?? ''}
                  onChange={e => updateFormData({ asking_price: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 850000"
                  disabled={!!formData.call_for_price}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!formData.call_for_price}
                  onChange={e => updateFormData({ call_for_price: e.target.checked })}
                  className="h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                />
                Call for Price
              </label>
            </div>
          </div>
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
