import React from 'react';
import { ArrowLeft, ArrowRight, Building2, Home, Layers, ArrowDownToLine } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Property & Layout',
  bullets: [
    'Basement bedrooms belong here — renters don\'t count a separated floor as a real bedroom.',
    'Full House, Duplex, and Basement listings get a special tag on the listing card.',
  ],
};

const PROPERTY_TYPES = [
  { value: 'apartment_building', label: 'Apartment\nin Building', icon: <Building2 className="w-6 h-6" /> },
  { value: 'apartment_house', label: 'Apartment\nin House', icon: <Home className="w-6 h-6" /> },
  { value: 'full_house', label: 'Full\nHouse', icon: <Building2 className="w-6 h-6" /> },
  { value: 'duplex', label: 'Duplex', icon: <Layers className="w-6 h-6" /> },
  { value: 'basement', label: 'Basement', icon: <ArrowDownToLine className="w-6 h-6" /> },
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

const ADDITIONAL_ROOM_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: '+1' },
  { value: 2, label: '+2' },
];

const BATHROOM_OPTIONS = [
  { value: 1, label: '1' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: '2' },
  { value: 2.5, label: '2.5' },
  { value: 3, label: '3' },
  { value: 3.5, label: '3.5+' },
];

interface Step1Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1PropertyTypeAndLayout({ formData, updateFormData, onNext, onBack }: Step1Props) {
  const canContinue = !!formData.property_type && formData.bedrooms !== undefined;

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
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
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
                    <span className={selected ? 'text-brand-700' : 'text-gray-400'}>
                      {pt.icon}
                    </span>
                    <span className="text-xs font-medium leading-tight whitespace-pre-line">
                      {pt.label}
                    </span>
                  </button>
                );
              })}
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
                  onClick={() => {
                    updateFormData({ bedrooms: opt.value });
                    if (opt.value === 0) updateFormData({ additional_rooms: 0 });
                  }}
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

          {/* Additional Rooms — only if bedrooms >= 1 */}
          {formData.bedrooms >= 1 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Rooms
                <span className="ml-1.5 text-xs font-normal text-gray-400">(bedrooms on a different floor or offices)</span>
              </label>
              <div className="flex gap-2">
                {ADDITIONAL_ROOM_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateFormData({ additional_rooms: opt.value })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      formData.additional_rooms === opt.value
                        ? 'bg-brand-700 border-brand-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bathrooms */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Bathrooms</label>
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

          {/* Floor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Floor
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="number"
              min={0}
              value={formData.floor ?? ''}
              onChange={e => updateFormData({ floor: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="e.g. 3"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
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
