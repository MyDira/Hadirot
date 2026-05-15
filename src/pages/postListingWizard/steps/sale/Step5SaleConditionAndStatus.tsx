import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Condition & Status',
  bullets: [
    'Be honest about condition. "Fair" or "Needs Work" attracts the right buyers and avoids wasting your time on showings that won\'t convert.',
    'Occupancy status affects how serious buyers approach you — vacant homes get more weekday showings.',
    'Delivery condition tells buyers what they\'re actually walking into — gives them confidence in their offer.',
  ],
};

const PROPERTY_CONDITION = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'needs_work', label: 'Needs Work' },
] as const;

const OCCUPANCY = [
  { value: 'owner_occupied', label: 'Owner Occupied' },
  { value: 'tenant_occupied', label: 'Tenant Occupied' },
  { value: 'vacant', label: 'Vacant' },
] as const;

const DELIVERY = [
  { value: 'vacant_at_closing', label: 'Vacant at Closing' },
  { value: 'subject_to_lease', label: 'Subject to Lease' },
  { value: 'negotiable', label: 'Negotiable' },
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
  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Condition & Status</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Property Condition</label>
            <PillGroup options={PROPERTY_CONDITION} value={formData.property_condition as any}
              onChange={v => updateFormData({ property_condition: (v ?? '') as any })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Occupancy Status</label>
            <PillGroup options={OCCUPANCY} value={formData.occupancy_status as any}
              onChange={v => updateFormData({ occupancy_status: (v ?? '') as any })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Condition</label>
            <PillGroup options={DELIVERY} value={formData.delivery_condition as any}
              onChange={v => updateFormData({ delivery_condition: (v ?? '') as any })} />
          </div>

          <div className="pt-5 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">Parking</label>
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
