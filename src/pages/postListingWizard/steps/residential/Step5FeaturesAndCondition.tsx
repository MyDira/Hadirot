import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Features drive search results',
  bullets: [
    '"Heat included" is the most-searched utility filter on HaDirot.',
    'Every amenity you add surfaces your listing to more renters.',
    'Checking "Heat" in utilities automatically sets the heat field.',
    'Square footage is optional but helpful for serious searchers.',
  ],
};

const UTILITY_OPTIONS = [
  { value: 'heat', label: 'Heat' },
  { value: 'gas', label: 'Gas' },
  { value: 'electric', label: 'Electric' },
  { value: 'water', label: 'Water' },
  { value: 'internet', label: 'Internet' },
  { value: 'cable', label: 'Cable' },
];

const AC_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'central', label: 'Central' },
  { value: 'split_unit', label: 'Split Unit' },
  { value: 'window', label: 'Window' },
] as const;

const PARKING_OPTIONS = [
  { value: 'no', label: 'No Parking' },
  { value: 'yes', label: 'Paid / Additional Cost' },
  { value: 'included', label: 'Included' },
  { value: 'optional', label: 'Optional' },
] as const;

const CONDITION_OPTIONS = [
  { value: 'modern', label: 'Modern' },
  { value: 'renovated', label: 'Renovated' },
  { value: 'large_rooms', label: 'Large Rooms' },
  { value: 'high_ceilings', label: 'High Ceilings' },
  { value: 'large_closets', label: 'Large Closets' },
];

interface Step5Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step5FeaturesAndCondition({ formData, updateFormData, onNext, onBack }: Step5Props) {
  const toggleUtility = (value: string) => {
    const current = formData.utilities_included ?? [];
    const next = current.includes(value)
      ? current.filter(u => u !== value)
      : [...current, value];
    updateFormData({ utilities_included: next });
  };

  const toggleCondition = (value: string) => {
    const current = formData.apartment_conditions ?? [];
    const next = current.includes(value)
      ? current.filter(c => c !== value)
      : [...current, value];
    updateFormData({ apartment_conditions: next });
  };

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Features & Condition</h2>

          {/* Utilities Included */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Utilities Included</label>
            <div className="flex flex-wrap gap-2">
              {UTILITY_OPTIONS.map(opt => {
                const active = (formData.utilities_included ?? []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleUtility(opt.value)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      active
                        ? 'bg-accent-500 border-accent-500 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-accent-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Heat — shows current synced value */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm font-medium text-gray-700 w-20 flex-shrink-0">Heat</span>
            <div className="flex gap-2">
              {(['included', 'tenant_pays'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    updateFormData({ heat: v });
                    // Sync utilities_included
                    const current = formData.utilities_included ?? [];
                    if (v === 'included' && !current.includes('heat')) {
                      updateFormData({ utilities_included: [...current, 'heat'] });
                    } else if (v === 'tenant_pays' && current.includes('heat')) {
                      updateFormData({ utilities_included: current.filter(u => u !== 'heat') });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                    formData.heat === v
                      ? 'bg-accent-500 border-accent-500 text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-accent-400'
                  }`}
                >
                  {v === 'included' ? 'Included' : 'Tenant Pays'}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400 ml-1">Synced with utilities above</span>
          </div>

          {/* AC Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Air Conditioning</label>
            <div className="flex flex-wrap gap-2">
              {AC_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateFormData({ ac_type: opt.value || null })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    (formData.ac_type ?? '') === opt.value
                      ? 'bg-accent-500 border-accent-500 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-accent-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Parking */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Parking</label>
            <div className="flex flex-wrap gap-2">
              {PARKING_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateFormData({ parking: opt.value })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    formData.parking === opt.value
                      ? 'bg-accent-500 border-accent-500 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-accent-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Appliances</label>
            <div className="flex flex-wrap gap-3">
              {[
                { field: 'washer_dryer_hookup' as const, label: 'Washer/Dryer Hookup' },
                { field: 'dishwasher' as const, label: 'Dishwasher' },
              ].map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!formData[field]}
                    onChange={e => updateFormData({ [field]: e.target.checked })}
                    className="h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Apartment Conditions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Apartment Condition</label>
            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map(opt => {
                const active = (formData.apartment_conditions ?? []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleCondition(opt.value)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      active
                        ? 'bg-accent-500 border-accent-500 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-accent-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Square Footage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Square Footage
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <div className="relative w-36">
              <input
                type="number"
                min={0}
                value={formData.square_footage ?? ''}
                onChange={e =>
                  updateFormData({ square_footage: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="e.g. 850"
                className="w-full pr-10 pl-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">sq ft</span>
            </div>
          </div>

          {/* Tenant Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes for Tenants
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={formData.tenant_notes ?? ''}
              onChange={e => updateFormData({ tenant_notes: e.target.value })}
              rows={3}
              placeholder="e.g. Pets allowed with deposit. Laundry in building. Quiet building…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 resize-none"
            />
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
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors"
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
