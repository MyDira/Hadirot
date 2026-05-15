import React from 'react';
import { ArrowLeft, ArrowRight, Home, Building2, Layers } from 'lucide-react';
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

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single-Family', icon: <Home className="w-6 h-6" /> },
  { value: 'two_family', label: 'Two-Family', icon: <Layers className="w-6 h-6" /> },
  { value: 'three_family', label: 'Three-Family', icon: <Layers className="w-6 h-6" /> },
  { value: 'four_family', label: 'Multi-Family', icon: <Building2 className="w-6 h-6" /> },
  { value: 'condo', label: 'Condo', icon: <Building2 className="w-6 h-6" /> },
  { value: 'co_op', label: 'Co-op', icon: <Building2 className="w-6 h-6" /> },
] as const;

const BUILDING_TYPES = [
  { value: 'detached', label: 'Detached' },
  { value: 'semi_attached', label: 'Semi-Attached' },
  { value: 'fully_attached', label: 'Fully Attached' },
  { value: 'apartment', label: 'Apartment' },
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
  { value: 1, label: '1' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: '2' },
  { value: 2.5, label: '2.5' },
  { value: 3, label: '3' },
  { value: 3.5, label: '3.5' },
  { value: 4, label: '4+' },
];

interface Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1SalePropertyAndLayout({ formData, updateFormData, onNext, onBack }: Props) {
  const isMultiFamily = ['two_family', 'three_family', 'four_family'].includes(formData.property_type);

  const canContinue =
    !!formData.property_type &&
    !!formData.building_type &&
    formData.bedrooms !== undefined &&
    !!formData.bathrooms;

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
            <div className="grid grid-cols-3 gap-3">
              {PROPERTY_TYPES.map(pt => {
                const selected = formData.property_type === pt.value;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => updateFormData({ property_type: pt.value })}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-center transition-all aspect-square ${
                      selected
                        ? 'border-brand-700 bg-brand-50 text-brand-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span className={selected ? 'text-brand-700' : 'text-gray-400'}>{pt.icon}</span>
                    <span className="text-xs font-medium leading-tight">{pt.label}</span>
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

          {/* Floors / Units / Years */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Floors
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
            {isMultiFamily && (
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
                  placeholder="e.g. 2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
