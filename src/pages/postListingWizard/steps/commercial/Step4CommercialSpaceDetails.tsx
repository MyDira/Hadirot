import React from 'react';
import { TYPE_SPECIFIC_FIELDS, type TypeSpecificField } from '../../../postCommercial/typeFieldConfigs';
import type { CommercialListingFormData } from '../../../postCommercial/commercialTypes';
import type { CommercialSpaceType } from '../../../../config/supabase';
import { StepShell, type CommercialStepProps, type StepTipsData } from './_StepShell';

const TIPS: StepTipsData = {
  heading: 'Space Details',
  bullets: [
    'Tips will appear here.',
  ],
};
import { WizardTriStateToggle } from './_TriStateToggle';

const FLOOR_LEVEL_OPTIONS = [
  { value: 'ground',         label: 'Ground' },
  { value: 'basement',       label: 'Basement' },
  { value: 'mezzanine',      label: 'Mezzanine' },
  { value: '2nd_floor',      label: '2nd Floor' },
  { value: '3rd_floor',      label: '3rd Floor' },
  { value: '4th_floor',      label: '4th Floor' },
  { value: '5th_plus',       label: '5th Floor+' },
  { value: 'full_building',  label: 'Full Building' },
];

const BUILD_OUT_OPTIONS = [
  { value: 'full_build_out',     label: 'Full Build-Out' },
  { value: 'turnkey',            label: 'Turnkey / Move-in Ready' },
  { value: 'second_generation',  label: 'Second Generation' },
  { value: 'vanilla_box',        label: 'Vanilla Box / White Box' },
  { value: 'shell',              label: 'Shell' },
  { value: 'cold_dark_shell',    label: 'Cold Dark Shell' },
];

const LEASE_TYPE_OPTIONS = [
  { value: 'nnn',              label: 'NNN (Triple Net)' },
  { value: 'gross',            label: 'Gross' },
  { value: 'modified_gross',   label: 'Modified Gross' },
  { value: 'full_service',     label: 'Full Service' },
  { value: 'percentage',       label: 'Percentage' },
  { value: 'industrial_gross', label: 'Industrial Gross' },
  { value: 'absolute_net',     label: 'Absolute Net' },
  { value: 'tenant_electric',  label: 'Tenant Electric' },
];

function renderTypeSpecificField(
  field: TypeSpecificField,
  formData: CommercialListingFormData,
  update: (u: Partial<CommercialListingFormData>) => void,
) {
  const key = field.key as keyof CommercialListingFormData;

  if (field.type === 'toggle') {
    const v = formData[key];
    const typedVal: boolean | null = v === true ? true : v === false ? false : null;
    return (
      <WizardTriStateToggle
        key={field.key}
        label={field.label}
        value={typedVal}
        recommended={field.recommended}
        onChange={val => update({ [field.key]: val } as any)}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <div key={field.key}>
        <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          {field.label}
          {field.unit && <span className="text-xs font-normal text-gray-400">({field.unit})</span>}
          {field.recommended && (
            <span className="text-xs font-normal text-accent-700 bg-accent-50 border border-accent-200 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </label>
        <input
          type="number"
          min={0}
          value={(formData[key] as number | null) ?? ''}
          onChange={e => update({ [field.key]: e.target.value ? Number(e.target.value) : null } as any)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
    );
  }

  if (field.type === 'text') {
    return (
      <div key={field.key}>
        <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          {field.label}
          {field.recommended && (
            <span className="text-xs font-normal text-accent-700 bg-accent-50 border border-accent-200 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </label>
        <input
          type="text"
          value={(formData[key] as string) ?? ''}
          onChange={e => update({ [field.key]: e.target.value } as any)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div key={field.key} className="sm:col-span-2">
        <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          {field.label}
          {field.recommended && (
            <span className="text-xs font-normal text-accent-700 bg-accent-50 border border-accent-200 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </label>
        <textarea
          value={(formData[key] as string) ?? ''}
          onChange={e => update({ [field.key]: e.target.value } as any)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm resize-y"
        />
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div key={field.key}>
        <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          {field.label}
          {field.recommended && (
            <span className="text-xs font-normal text-accent-700 bg-accent-50 border border-accent-200 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </label>
        <select
          value={(formData[key] as string) ?? ''}
          onChange={e => update({ [field.key]: e.target.value || null } as any)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
        >
          <option value="">Select…</option>
          {field.options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}

export function Step4CommercialSpaceDetails({ formData, updateFormData, isSale, onNext, onBack }: CommercialStepProps) {
  const typeFields: TypeSpecificField[] = formData.commercial_space_type
    ? TYPE_SPECIFIC_FIELDS[formData.commercial_space_type as CommercialSpaceType] || []
    : [];

  return (
    <StepShell title="Space Details" onBack={onBack} onNext={onNext} tips={TIPS}>
      {/* Type-specific fields */}
      {typeFields.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {formData.commercial_space_type
              ? formData.commercial_space_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
              : 'Space'}{' '}
            features
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {typeFields.map(f => renderTypeSpecificField(f, formData, updateFormData))}
          </div>
        </div>
      )}

      {/* Universal space-related fields */}
      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">General</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ceiling Height (ft)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={formData.ceiling_height_ft ?? ''}
              onChange={e => updateFormData({ ceiling_height_ft: e.target.value ? Number(e.target.value) : null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Floor Level</label>
            <select
              value={formData.floor_level}
              onChange={e => updateFormData({ floor_level: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
            >
              <option value="">Select…</option>
              {FLOOR_LEVEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Build-Out Condition</label>
            <select
              value={formData.build_out_condition ?? ''}
              onChange={e => updateFormData({ build_out_condition: (e.target.value as any) || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
            >
              <option value="">Select…</option>
              {BUILD_OUT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {!isSale && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lease Type</label>
              <select
                value={formData.lease_type ?? ''}
                onChange={e => updateFormData({ lease_type: (e.target.value as any) || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
              >
                <option value="">Select…</option>
                {LEASE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </StepShell>
  );
}
