import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Features & Condition',
  bullets: [
    'Parking is one of the most-filtered amenities — mark it accurately.',
    'Every feature you add surfaces your listing to more renters.',
    'Square footage is optional but helps serious searchers.',
  ],
};

const UTILITY_OPTIONS = [
  { value: 'heat', label: 'Heat' },
  { value: 'hot_water', label: 'Hot Water' },
  { value: 'gas', label: 'Gas' },
  { value: 'electric', label: 'Electric' },
  { value: 'water', label: 'Water & Sewer' },
  { value: 'internet', label: 'Internet' },
];

const AC_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'central', label: 'Central' },
  { value: 'split_unit', label: 'Split Unit' },
  { value: 'window', label: 'Window' },
] as const;

const PARKING_OPTIONS = [
  { value: 'no', label: 'No Parking' },
  { value: 'yes', label: 'Available' },
  { value: 'included', label: 'Included' },
  { value: 'optional', label: 'Optional' },
] as const;

const APPLIANCE_OPTIONS = [
  { field: 'washer_dryer_hookup' as const, label: 'Washer/Dryer Hookup' },
  { field: 'dishwasher' as const, label: 'Dishwasher' },
];

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
                        ? 'bg-brand-700 border-brand-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
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
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Appliances */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Appliances</label>
            <div className="flex flex-wrap gap-2">
              {APPLIANCE_OPTIONS.map(({ field, label }) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => updateFormData({ [field]: !formData[field] })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    formData[field]
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {label}
                </button>
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
                        ? 'bg-brand-700 border-brand-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
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
