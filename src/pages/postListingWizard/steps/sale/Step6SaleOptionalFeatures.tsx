import React from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import type { RentRollUnit } from '../../../../config/supabase';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Details & Features',
  bullets: [
    'Property taxes: check your latest NYC Finance bill or search your address on nycproperty.nyc.gov — buyers factor this into their offer.',
    'For multi-family properties, a complete rent roll significantly increases buyer confidence.',
    'Fill in what you can — the more complete your listing, the fewer back-and-forth calls.',
  ],
};

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

const HEATING = [
  { value: 'forced_air', label: 'Forced Hot Air' },
  { value: 'radiator', label: 'Radiant' },
  { value: 'baseboard', label: 'Baseboard' },
  { value: 'heat_pump', label: 'Heat Pump' },
  { value: 'other', label: 'Other' },
] as const;

const AC = [
  { value: 'central', label: 'Central AC' },
  { value: 'split_unit', label: 'Split Unit' },
  { value: 'window', label: 'Window AC' },
] as const;

const LAUNDRY = [
  { value: 'in_unit', label: 'In-Unit' },
  { value: 'hookups_only', label: 'Hookups Only' },
  { value: 'common_area', label: 'Common Area' },
  { value: 'none', label: 'None' },
] as const;

const BASEMENT = [
  { value: 'finished', label: 'Finished' },
  { value: 'unfinished', label: 'Unfinished' },
  { value: 'partially_finished', label: 'Partially Finished' },
  { value: 'walkout', label: 'Walkout' },
  { value: 'none', label: 'None' },
] as const;

const OUTDOOR = ['balcony', 'terrace', 'patio', 'backyard', 'roof_deck', 'shared_yard'];
const OUTDOOR_LABELS: Record<string, string> = {
  balcony: 'Balcony', terrace: 'Terrace', patio: 'Patio',
  backyard: 'Backyard', roof_deck: 'Roof Deck', shared_yard: 'Shared Yard',
};

const INTERIOR = [
  'modern', 'renovated', 'large_rooms', 'high_ceilings_10ft', 'large_closets',
  'hardwood_floors', 'crown_molding', 'fireplace', 'walk_in_closet',
  'built_in_storage', 'exposed_brick', 'herringbone_floors', 'coffered_ceilings',
];
const INTERIOR_LABELS: Record<string, string> = {
  modern: 'Modern', renovated: 'Renovated', large_rooms: 'Large Rooms',
  high_ceilings_10ft: 'High Ceilings (10ft+)', large_closets: 'Large Closets',
  hardwood_floors: 'Hardwood Floors', crown_molding: 'Crown Molding',
  fireplace: 'Fireplace', walk_in_closet: 'Walk-in Closet',
  built_in_storage: 'Built-in Storage', exposed_brick: 'Exposed Brick',
  herringbone_floors: 'Herringbone Floors', coffered_ceilings: 'Coffered Ceilings',
};

const APPLIANCES = ['refrigerator', 'stove_oven', 'dishwasher', 'microwave', 'washer', 'dryer', 'garbage_disposal'];
const APPLIANCE_LABELS: Record<string, string> = {
  refrigerator: 'Refrigerator', stove_oven: 'Stove/Oven', dishwasher: 'Dishwasher',
  microwave: 'Microwave', washer: 'Washer', dryer: 'Dryer', garbage_disposal: 'Garbage Disposal',
};

const UTILITIES_INCLUDED = ['heat', 'hot_water', 'gas', 'electric', 'water', 'internet'];
const UTILITY_LABELS: Record<string, string> = {
  heat: 'Heat', hot_water: 'Hot Water', gas: 'Gas',
  electric: 'Electric', water: 'Water & Sewer', internet: 'Internet',
};

interface Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

function Pills<T extends string>({
  options, value, onChange,
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
        >{opt.label}</button>
      ))}
    </div>
  );
}

function MultiPills({
  options, labels, selected, onToggle,
}: {
  options: string[]; labels: Record<string, string>;
  selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(v => {
        const active = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            className={`px-3.5 py-1.5 rounded-lg border text-sm font-medium transition-all ${
              active
                ? 'bg-brand-700 border-brand-700 text-white'
                : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
            }`}
          >{labels[v]}</button>
        );
      })}
    </div>
  );
}

export function Step6SaleOptionalFeatures({ formData, updateFormData, onNext, onBack }: Props) {
  const isMultiFamily =
    formData.property_type === 'two_family' ||
    formData.property_type === 'three_family' ||
    formData.property_type === 'four_family';

  const toggle = (key: 'outdoor_space' | 'interior_features' | 'apartment_conditions' | 'utilities_included', v: string) => {
    const arr = (formData[key] as string[]) || [];
    updateFormData({ [key]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] } as any);
  };

  const updateRentRoll = (idx: number, field: keyof RentRollUnit, val: string | number) => {
    const arr = [...(formData.rent_roll_data || [])];
    arr[idx] = { ...arr[idx], [field]: val } as RentRollUnit;
    updateFormData({ rent_roll_data: arr });
  };
  const addRentRollUnit = () =>
    updateFormData({ rent_roll_data: [...(formData.rent_roll_data || []), { unit: '', bedrooms: 0, rent: 0 }] });
  const removeRentRollUnit = (idx: number) =>
    updateFormData({ rent_roll_data: (formData.rent_roll_data || []).filter((_, i) => i !== idx) });

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Details & Features</h2>
            <p className="text-sm text-gray-500 mt-0.5">Everything here is optional — but more details means more inquiries.</p>
          </div>

          {/* Year Built & Year Renovated */}
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

          {/* Property Taxes & HOA/Maintenance */}
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
                  placeholder="e.g. 8000"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.property_type === 'co_op' ? 'Monthly Maintenance' : 'HOA Fees / Monthly Maintenance'}
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  value={formData.hoa_fees ?? ''}
                  onChange={e => updateFormData({ hoa_fees: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 450"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>
          </div>

          {/* Occupancy Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Occupancy Status
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <Pills options={OCCUPANCY} value={formData.occupancy_status as any}
              onChange={v => updateFormData({ occupancy_status: (v ?? '') as any })} />
          </div>

          {/* Delivery Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delivery Status
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <Pills options={DELIVERY} value={formData.delivery_condition as any}
              onChange={v => updateFormData({ delivery_condition: (v ?? '') as any })} />
          </div>

          <div className="pt-2 border-t border-gray-100" />

          {/* Heating Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Heating Type</label>
            <Pills options={HEATING} value={formData.heating_type as any}
              onChange={v => updateFormData({ heating_type: (v ?? null) as any })} />
          </div>

          {/* AC Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AC Type</label>
            <Pills options={AC} value={formData.ac_type as any}
              onChange={v => updateFormData({ ac_type: (v ?? null) as any })} />
          </div>

          {/* Laundry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Laundry</label>
            <Pills options={LAUNDRY} value={formData.laundry_type as any}
              onChange={v => updateFormData({ laundry_type: (v ?? '') as any })} />
          </div>

          {/* Basement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Basement</label>
            <Pills options={BASEMENT} value={formData.basement_type as any}
              onChange={v => updateFormData({ basement_type: (v ?? '') as any })} />
          </div>

          {formData.basement_type && formData.basement_type !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Basement Notes</label>
              <textarea
                rows={2}
                value={formData.basement_notes ?? ''}
                onChange={e => updateFormData({ basement_notes: e.target.value })}
                placeholder="Ceiling height, features, additional details…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
          )}

          {/* Outdoor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Outdoor Space</label>
            <MultiPills options={OUTDOOR} labels={OUTDOOR_LABELS}
              selected={formData.outdoor_space || []}
              onToggle={v => toggle('outdoor_space', v)} />
          </div>

          {/* Interior */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Interior Features</label>
            <MultiPills options={INTERIOR} labels={INTERIOR_LABELS}
              selected={formData.interior_features || []}
              onToggle={v => toggle('interior_features', v)} />
          </div>

          {/* Appliances */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Appliances Included</label>
            <MultiPills options={APPLIANCES} labels={APPLIANCE_LABELS}
              selected={formData.apartment_conditions || []}
              onToggle={v => toggle('apartment_conditions', v)} />
          </div>
        </div>

        {/* Multi-family rent roll */}
        {isMultiFamily && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Multi-Family Information</h3>
              <p className="text-sm text-gray-500 mt-0.5">Optional but recommended — investors look for this.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Monthly Rent Roll</label>
              <div className="relative w-44">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  value={formData.rent_roll_total ?? ''}
                  onChange={e => updateFormData({ rent_roll_total: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 4000"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Per-Unit Rent Breakdown</label>
                <button type="button" onClick={addRentRollUnit} className="flex items-center gap-1 text-sm text-accent-600 hover:text-accent-700 font-medium">
                  <Plus className="w-4 h-4" /> Add Unit
                </button>
              </div>
              {(formData.rent_roll_data || []).map((unit, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                  <input
                    type="text"
                    value={unit.unit}
                    onChange={e => updateRentRoll(idx, 'unit', e.target.value)}
                    placeholder="Unit #"
                    className="col-span-3 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <input
                    type="number"
                    min={0}
                    value={unit.bedrooms ?? ''}
                    onChange={e => updateRentRoll(idx, 'bedrooms', parseInt(e.target.value) || 0)}
                    placeholder="Beds"
                    className="col-span-3 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <input
                    type="number"
                    min={0}
                    value={unit.rent ?? ''}
                    onChange={e => updateRentRoll(idx, 'rent', parseFloat(e.target.value) || 0)}
                    placeholder="Rent"
                    className="col-span-5 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <button type="button" onClick={() => removeRentRollUnit(idx)} className="col-span-1 flex items-center justify-center text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Utilities Included</label>
              <MultiPills options={UTILITIES_INCLUDED} labels={UTILITY_LABELS}
                selected={formData.utilities_included || []}
                onToggle={v => toggle('utilities_included', v)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Notes</label>
              <textarea
                rows={3}
                value={formData.tenant_notes ?? ''}
                onChange={e => updateFormData({ tenant_notes: e.target.value })}
                placeholder="Lease end dates, tenant info, etc…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
          </div>
        )}

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
