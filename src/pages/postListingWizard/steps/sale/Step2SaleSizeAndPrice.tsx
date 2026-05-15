import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Size & Price',
  bullets: [
    'Real numbers attract serious buyers. Vague pricing wastes everyone\'s time.',
    'Don\'t know exact sqft? The Dimensions option lets you enter length × width and we\'ll calculate.',
    'HOA / monthly maintenance is a top buyer question — leaving it blank reads as "high".',
  ],
};

interface Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2SaleSizeAndPrice({ formData, updateFormData, onNext, onBack }: Props) {
  const isCoOp = formData.property_type === 'co_op';
  const hoaLabel = isCoOp ? 'Monthly Maintenance' : 'HOA Fees (Monthly)';

  const buildingCalc =
    formData.building_size_input_mode === 'dimensions' && formData.building_length_ft && formData.building_width_ft
      ? Math.round(formData.building_length_ft * formData.building_width_ft)
      : null;
  const lotCalc =
    formData.lot_size_input_mode === 'dimensions' && formData.property_length_ft && formData.property_width_ft
      ? Math.round(formData.property_length_ft * formData.property_width_ft)
      : null;

  const canContinue = formData.call_for_price || (!!formData.asking_price && formData.asking_price > 0);

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Size & Price</h2>

          {/* Building Size */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Building Size
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <div className="flex gap-4 mb-3">
              {(['sqft', 'dimensions'] as const).map(mode => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    checked={formData.building_size_input_mode === mode}
                    onChange={() => updateFormData({ building_size_input_mode: mode })}
                    className="text-accent-500 focus:ring-accent-500"
                  />
                  {mode === 'sqft' ? 'Square Feet' : 'Dimensions'}
                </label>
              ))}
            </div>
            {formData.building_size_input_mode === 'dimensions' ? (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={formData.building_length_ft ?? ''}
                  onChange={e => updateFormData({ building_length_ft: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Length (ft) e.g. 50"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={formData.building_width_ft ?? ''}
                  onChange={e => updateFormData({ building_width_ft: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Width (ft) e.g. 30"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                {buildingCalc && (
                  <p className="col-span-2 text-xs text-gray-500">Calculated: {buildingCalc.toLocaleString()} sq ft</p>
                )}
              </div>
            ) : (
              <input
                type="number"
                min={1}
                value={formData.building_size_sqft ?? ''}
                onChange={e => updateFormData({ building_size_sqft: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 1500"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            )}
          </div>

          {/* Lot Size */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lot Size
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <div className="flex gap-4 mb-3">
              {(['sqft', 'dimensions'] as const).map(mode => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    checked={formData.lot_size_input_mode === mode}
                    onChange={() => updateFormData({ lot_size_input_mode: mode })}
                    className="text-accent-500 focus:ring-accent-500"
                  />
                  {mode === 'sqft' ? 'Square Feet' : 'Dimensions'}
                </label>
              ))}
            </div>
            {formData.lot_size_input_mode === 'dimensions' ? (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={formData.property_length_ft ?? ''}
                  onChange={e => updateFormData({ property_length_ft: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Length (ft) e.g. 100"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={formData.property_width_ft ?? ''}
                  onChange={e => updateFormData({ property_width_ft: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Width (ft) e.g. 50"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
                {lotCalc && (
                  <p className="col-span-2 text-xs text-gray-500">Calculated: {lotCalc.toLocaleString()} sq ft</p>
                )}
              </div>
            ) : (
              <input
                type="number"
                min={1}
                value={formData.lot_size_sqft ?? ''}
                onChange={e => updateFormData({ lot_size_sqft: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            )}
          </div>

          {/* Asking Price */}
          <div className="mb-6 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Asking Price <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={1}
                  step={1000}
                  value={formData.asking_price ?? ''}
                  onChange={e => updateFormData({ asking_price: e.target.value ? Number(e.target.value) : null })}
                  disabled={formData.call_for_price}
                  placeholder="e.g. 850000"
                  className="pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm w-44 focus:ring-accent-500 focus:border-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.call_for_price}
                  onChange={e =>
                    updateFormData({
                      call_for_price: e.target.checked,
                      asking_price: e.target.checked ? null : formData.asking_price,
                    })
                  }
                  className="h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Call for Price</span>
              </label>
            </div>
          </div>

          {/* Taxes & HOA */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Property Taxes
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  value={formData.property_taxes ?? ''}
                  onChange={e => updateFormData({ property_taxes: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 5000"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {hoaLabel}
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  value={formData.hoa_fees ?? ''}
                  onChange={e => updateFormData({ hoa_fees: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 200"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <StepTips {...TIPS} />
    </div>
  );
}
