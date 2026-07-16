import React, { useEffect, useRef } from 'react';
import {
  Store,
  UtensilsCrossed,
  Briefcase,
  Warehouse,
  Factory,
  Building2,
  Users,
  ArrowDownToLine,
} from 'lucide-react';
import type { CommercialSpaceType, CommercialSubtype } from '../../../../config/supabase';
import { SPACE_TYPE_SUBTYPES, TYPE_SPECIFIC_FIELD_KEYS } from '../../../postCommercial/typeFieldConfigs';
import type { CommercialListingFormData } from '../../../postCommercial/commercialTypes';
import { StepShell, type CommercialStepProps, type StepTipsData } from './_StepShell';

const TIPS: StepTipsData = {
  heading: 'Type & Pricing',
  bullets: [
    'Pick the space type that best matches the unit — it drives the spec fields shown later.',
    'Rentals are usually quoted per SF/year; enter the monthly asking rent if that is how you list.',
    'For sales, enter the asking price. Not ready to show a number? Toggle “Call for price”.',
  ],
};

const SPACE_TYPES: { value: CommercialSpaceType; label: string; icon: React.ReactNode }[] = [
  { value: 'storefront',          label: 'Retail / Storefront', icon: <Store className="w-8 h-8" /> },
  { value: 'restaurant',          label: 'Restaurant',          icon: <UtensilsCrossed className="w-8 h-8" /> },
  { value: 'office',              label: 'Office',              icon: <Briefcase className="w-8 h-8" /> },
  { value: 'warehouse',           label: 'Warehouse',           icon: <Warehouse className="w-8 h-8" /> },
  { value: 'industrial',          label: 'Industrial',          icon: <Factory className="w-8 h-8" /> },
  { value: 'mixed_use',           label: 'Mixed Use',           icon: <Building2 className="w-8 h-8" /> },
  { value: 'community_facility',  label: 'Community Facility',  icon: <Users className="w-8 h-8" /> },
  { value: 'basement_commercial', label: 'Basement Commercial', icon: <ArrowDownToLine className="w-8 h-8" /> },
];

const TYPE_SPECIFIC_RESET: Partial<CommercialListingFormData> = {
  frontage_ft: null,
  corner_location: null as any,
  foot_traffic_vpd: null,
  signage_rights: null as any,
  ada_accessible: null as any,
  previous_use: '',
  seating_capacity: null,
  kitchen_exhaust: null as any,
  grease_trap: null as any,
  gas_line: null as any,
  liquor_license_transferable: null as any,
  ventilation: null as any,
  private_offices: null,
  conference_rooms: null,
  building_class: null,
  layout_type: '',
  natural_light: null as any,
  plumbing_wet_columns: null as any,
  clear_height_ft: null,
  loading_docks: null,
  drive_in_doors: null,
  three_phase_power: null as any,
  rail_access: null as any,
  column_spacing: '',
  office_warehouse_ratio: '',
  floor_load_capacity: '',
  truck_court_depth: '',
  electrical_amps: null,
  electrical_voltage: '',
  crane_capacity: '',
  sprinkler_type: '',
  use_breakdown: '',
  unit_count: null,
  number_of_floors: null,
  permitted_uses_commercial: '',
  occupancy_limit: null,
  separate_entrance: null as any,
  capacity_min: null,
  capacity_max: null,
  waiting_room: null as any,
  moisture_waterproofing: null as any,
};

function hasTypeSpecificData(fd: CommercialListingFormData, type: CommercialSpaceType): boolean {
  const keys = TYPE_SPECIFIC_FIELD_KEYS[type] || [];
  for (const key of keys) {
    const v = (fd as any)[key];
    if (v !== null && v !== undefined && v !== '' && v !== false) return true;
  }
  return false;
}

export function Step1CommercialTypeAndPricing({
  formData,
  updateFormData,
  isSale,
  onNext,
  onBack,
}: CommercialStepProps) {
  const subtypeOptions = formData.commercial_space_type
    ? SPACE_TYPE_SUBTYPES[formData.commercial_space_type as CommercialSpaceType]
    : undefined;

  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [pendingType, setPendingType] = React.useState<CommercialSpaceType | null>(null);
  const pricePerSfManuallyEdited = useRef(false);

  const applyType = (type: CommercialSpaceType) => {
    updateFormData({
      commercial_space_type: type,
      commercial_subtype: null,
      ...TYPE_SPECIFIC_RESET,
    });
    pricePerSfManuallyEdited.current = false;
  };

  const handleTypeClick = (type: CommercialSpaceType) => {
    const current = formData.commercial_space_type as CommercialSpaceType | '';
    if (current && current !== type && hasTypeSpecificData(formData, current)) {
      setPendingType(type);
      setShowResetConfirm(true);
      return;
    }
    applyType(type);
  };

  const handleSubtype = (val: CommercialSubtype | '__default__') => {
    updateFormData({ commercial_subtype: val === '__default__' ? null : (val as CommercialSubtype) });
  };

  // Auto-calculate price_per_sf_year for lease (annual rate from monthly rent).
  useEffect(() => {
    if (isSale) return;
    if (pricePerSfManuallyEdited.current) return;
    if (formData.price && formData.price > 0 && formData.available_sf && formData.available_sf > 0) {
      const calc = parseFloat(((formData.price * 12) / formData.available_sf).toFixed(2));
      if (calc !== formData.price_per_sf_year) {
        updateFormData({ price_per_sf_year: calc });
      }
    }
  }, [isSale, formData.price, formData.available_sf, formData.price_per_sf_year, updateFormData]);

  const canContinue =
    !!formData.commercial_space_type &&
    !!formData.available_sf &&
    formData.available_sf > 0 &&
    (formData.call_for_price ||
      (isSale
        ? !!formData.asking_price && formData.asking_price > 0
        : !!formData.price && formData.price > 0));

  return (
    <>
      <StepShell title="Type & Pricing" onBack={onBack} onNext={onNext} canContinue={canContinue} tips={TIPS}>
        {/* Space Type grid */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Space Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SPACE_TYPES.map(opt => {
              const selected = formData.commercial_space_type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeClick(opt.value)}
                  className={`flex flex-col items-center justify-center gap-1 p-1.5 rounded-xl border-2 text-center transition-all aspect-square ${
                    selected
                      ? 'border-brand-700 bg-brand-50 text-brand-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className={selected ? 'text-brand-700' : 'text-gray-400'}>{opt.icon}</span>
                  <span className="text-[10px] font-medium leading-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtype */}
        {subtypeOptions && subtypeOptions.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Subtype</label>
            <div className="flex flex-wrap gap-2">
              {subtypeOptions.map(option => {
                const isSelected =
                  option.value === '__default__'
                    ? formData.commercial_subtype === null
                    : formData.commercial_subtype === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSubtype(option.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-brand-700 border-brand-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sizing + Pricing — full-width grid */}
        <div className="pt-2 border-t border-gray-100">
          {isSale ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Available SF */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Available SF <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    value={formData.available_sf ?? ''}
                    onChange={e => updateFormData({ available_sf: e.target.value ? Number(e.target.value) : null })}
                    placeholder="e.g. 1200"
                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">SF</span>
                </div>
              </div>

              {/* Asking Price */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Asking Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min={1}
                    step={1000}
                    value={formData.asking_price ?? ''}
                    onChange={e => updateFormData({ asking_price: e.target.value ? Number(e.target.value) : null })}
                    placeholder="e.g. 1,500,000"
                    disabled={!!formData.call_for_price}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 mt-2">
                  <input
                    type="checkbox"
                    checked={!!formData.call_for_price}
                    onChange={e => updateFormData({ call_for_price: e.target.checked })}
                    className="h-3.5 w-3.5 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                  />
                  Contact for pricing
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {/* Available SF */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Available SF <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    value={formData.available_sf ?? ''}
                    onChange={e => updateFormData({ available_sf: e.target.value ? Number(e.target.value) : null })}
                    placeholder="e.g. 1200"
                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">SF</span>
                </div>
              </div>

              {/* Monthly Rent */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Monthly Rent <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min={1}
                    value={formData.price ?? ''}
                    onChange={e => updateFormData({ price: e.target.value ? Number(e.target.value) : null })}
                    placeholder="e.g. 5,500"
                    disabled={!!formData.call_for_price}
                    className="w-full pl-7 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/mo</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 mt-2">
                  <input
                    type="checkbox"
                    checked={!!formData.call_for_price}
                    onChange={e => updateFormData({ call_for_price: e.target.checked })}
                    className="h-3.5 w-3.5 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                  />
                  Contact for pricing
                </label>
              </div>

              {/* $/SF/yr */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  $/SF/yr <span className="text-gray-400 font-normal">(auto)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.price_per_sf_year ?? ''}
                    onChange={e => {
                      pricePerSfManuallyEdited.current = true;
                      updateFormData({ price_per_sf_year: e.target.value ? Number(e.target.value) : null });
                    }}
                    placeholder="—"
                    disabled={!!formData.call_for_price}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </StepShell>

      {/* Type-change confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Change Space Type?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Changing the space type will reset the space-specific fields you have already filled in.
              Your pricing, location, photos, and contact info will be preserved.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  setPendingType(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingType) applyType(pendingType);
                  setShowResetConfirm(false);
                  setPendingType(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-accent-500 rounded-lg hover:bg-accent-600"
              >
                Change Type
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
