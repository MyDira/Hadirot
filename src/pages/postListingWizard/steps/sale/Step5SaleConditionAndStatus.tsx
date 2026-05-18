import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Size & Condition',
  bullets: [
    'Be honest about condition. "Fair" or "Needs Work" attracts the right buyers and avoids wasting your time on showings that won\'t convert.',
    'Building size and lot size are key search filters for buyers — enter them in whichever format you know.',
    'You can enter square footage directly, or use length × width if that\'s how you know the dimensions.',
    'Number of floors helps buyers understand the layout at a glance.',
  ],
};

const PROPERTY_CONDITION = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'needs_work', label: 'Needs Work' },
] as const;

const PARKING = [
  { value: 'no', label: 'No Parking' },
  { value: 'yes', label: 'Private Driveway' },
  { value: 'included', label: 'Shared Driveway' },
  { value: 'carport', label: 'Carport' },
  { value: 'optional', label: 'Easement' },
] as const;

interface Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | '' | null | undefined;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(value === opt.value ? null : opt.value)}
          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            value === opt.value
              ? 'bg-brand-700 border-brand-700 text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Step5SaleConditionAndStatus({ formData, updateFormData, onNext, onBack }: Props) {
  const showUnitCount = formData.property_type === 'four_family';
  const buildingMode = (formData as any).building_size_input_mode || 'sqft';
  const lotMode = (formData as any).lot_size_input_mode || 'sqft';

  const buildingAutoCalc =
    buildingMode === 'dimensions' && (formData as any).building_length_ft && (formData as any).building_width_ft
      ? Math.round((formData as any).building_length_ft * (formData as any).building_width_ft)
      : null;
  const lotAutoCalc =
    lotMode === 'dimensions' && (formData as any).property_length_ft && (formData as any).property_width_ft
      ? Math.round((formData as any).property_length_ft * (formData as any).property_width_ft)
      : null;

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Size & Condition</h2>

          {/* Property Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property Condition
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <PillGroup options={PROPERTY_CONDITION} value={formData.property_condition as any}
              onChange={v => updateFormData({ property_condition: (v ?? '') as any })} />
          </div>

          {/* Building Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Building Size
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="building_size_mode" value="sqft"
                  checked={buildingMode === 'sqft'}
                  onChange={() => updateFormData({ building_size_input_mode: 'sqft' } as any)}
                  className="text-accent-500 focus:ring-accent-500" />
                Square feet
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="building_size_mode" value="dimensions"
                  checked={buildingMode === 'dimensions'}
                  onChange={() => updateFormData({ building_size_input_mode: 'dimensions' } as any)}
                  className="text-accent-500 focus:ring-accent-500" />
                Length × Width
              </label>
            </div>
            {buildingMode === 'sqft' ? (
              <div className="relative w-44">
                <input
                  type="number"
                  min={1}
                  value={(formData as any).building_size_sqft ?? ''}
                  onChange={e => updateFormData({ building_size_sqft: e.target.value ? Number(e.target.value) : undefined } as any)}
                  placeholder="e.g. 2400"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">sq ft</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={(formData as any).building_length_ft ?? ''}
                  onChange={e => updateFormData({ building_length_ft: e.target.value ? Number(e.target.value) : undefined } as any)}
                  placeholder="Length (ft)"
                  className="w-36 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                <span className="text-gray-400 text-sm">×</span>
                <input
                  type="number"
                  min={1}
                  value={(formData as any).building_width_ft ?? ''}
                  onChange={e => updateFormData({ building_width_ft: e.target.value ? Number(e.target.value) : undefined } as any)}
                  placeholder="Width (ft)"
                  className="w-36 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                {buildingAutoCalc && (
                  <span className="text-sm text-gray-500">= {buildingAutoCalc.toLocaleString()} sq ft</span>
                )}
              </div>
            )}
          </div>

          {/* Lot Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lot Size
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="lot_size_mode" value="sqft"
                  checked={lotMode === 'sqft'}
                  onChange={() => updateFormData({ lot_size_input_mode: 'sqft' } as any)}
                  className="text-accent-500 focus:ring-accent-500" />
                Square feet
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="lot_size_mode" value="dimensions"
                  checked={lotMode === 'dimensions'}
                  onChange={() => updateFormData({ lot_size_input_mode: 'dimensions' } as any)}
                  className="text-accent-500 focus:ring-accent-500" />
                Length × Width
              </label>
            </div>
            {lotMode === 'sqft' ? (
              <div className="relative w-44">
                <input
                  type="number"
                  min={1}
                  value={(formData as any).lot_size_sqft ?? ''}
                  onChange={e => updateFormData({ lot_size_sqft: e.target.value ? Number(e.target.value) : undefined } as any)}
                  placeholder="e.g. 4000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">sq ft</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={(formData as any).property_length_ft ?? ''}
                  onChange={e => updateFormData({ property_length_ft: e.target.value ? Number(e.target.value) : undefined } as any)}
                  placeholder="Length (ft)"
                  className="w-36 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                <span className="text-gray-400 text-sm">×</span>
                <input
                  type="number"
                  min={1}
                  value={(formData as any).property_width_ft ?? ''}
                  onChange={e => updateFormData({ property_width_ft: e.target.value ? Number(e.target.value) : undefined } as any)}
                  placeholder="Width (ft)"
                  className="w-36 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                {lotAutoCalc && (
                  <span className="text-sm text-gray-500">= {lotAutoCalc.toLocaleString()} sq ft</span>
                )}
              </div>
            )}
          </div>

          {/* Number of Floors */}
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
              className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
            />
          </div>

          {/* Number of Units — only for four_family */}
          {showUnitCount && (
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
                className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
          )}

          {/* Parking */}
          <div className="pt-5 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parking
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <PillGroup options={PARKING} value={formData.parking as any}
              onChange={v => updateFormData({ parking: (v ?? 'no') as any })} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <StepTips {...TIPS} />
    </div>
  );
}
